module.exports=function init(MYSQL,opts){
    var Promise = require("bluebird")
        ,async=require("async")
        ,_=require("lodash")
        ,db
    db={
         verbose:1
        ,log:(query,rows,queryLine,took,db)=>{
            console.log(`query in ${took}s:`,query.sql)
        }
        ,query:(flow,...queryInfo)=>{
            flow=flow||'series'

            var callback=queryInfo.pop()
            //did I assume there was a callback when there wasn't?
            if(!_.isFunction(callback)){
                queryInfo.push(callback)
                callback=false
            }
            //successive sets are "sql",[sub],"sql",[sub]
            var querySets=[]
                ,set=null
                ,fxns=[]
                ,results=[]
                ,isVerbose=db.verbose
                ,lastItemIndex=queryInfo.length-1
                ,queryLine=isVerbose ?
                    (new Error("!").stack).split('\n').filter((line,i)=>i && !line.match(/node_modules\/dbq\/dbq/))[0].split(":")[1]
                    : false

            //group into {sql:"",sub:[]} sets to call in desired flow
            queryInfo.forEach((v,i)=>{
                if(_.isString(v)){
                    if(set) querySets.push(set)//append the previous one that didn't have a substitution
                    set={sql:v}
                    if(lastItemIndex==i) querySets.push(set)
                }
                else if(_.isArray(v)){
                    if(v.length){
                        //if I want to say "...where x in (?)",[ [] ] <- and I supply an empty array for the subtitution, it will err.  Replace this with a null, where it returns no results w/o erring
                        v=v.map(x=> _.isArray(x) && x.length==0 ? null :x )
                        set.substitute=v
                    }
                    querySets.push(set)
                    set=null
                }
            })

            //form into async input function set
            querySets=querySets.map((qset,i)=>{
                //note connections are lazily retained, so this won't have real overhead once the pool is filled
                return next=>{
                    var t1=Date.now()
                    MYSQL.getConnection((err,dbi)=>{
                        if(err) throw Error(err)
                        var query=dbi.query(qset.sql,qset.substitute,(err,rows)=>{
                            dbi.release()//done querying
                            var t2=Date.now()
                                ,took=((t2-t1)/1000).toFixed(3)
                            if(isVerbose) db.log(query,rows,queryLine,took,db)
                            //handle error better...
                            if(err) console.log("BAD QUERY! this one:",query.sql,err)
                            else{
                                //did you hint you only want one row? If so, don't return a row, just the object
                                var wantOnlyOne=!!qset.sql.match(/limit\s+1\s*$/i)
                                results[i]=wantOnlyOne ? rows[0] : rows

                                //further, if you're a single-key, return value.
                                if(wantOnlyOne){
                                    var k=Object.keys(results[i]||{})
                                    if(k.length==1)
                                        results[i]=results[i][k[0]]
                                }
                            }
                            next(err,err?[]:results)
                        })
                    })
                }
            })

            //call in desired flow & synchronicity, then place results as params to callback in original sequence provided.  This lets writer usefully name result vars in callback

            if(callback)
                return async[flow]( ...[
                    querySets
                    , x => callback(...results)
                ])
            else
                return new Promise((resolve,reject)=>{
                    async[flow]( ...[
                        querySets
                        , (err,asyncResults) =>{
                            if(err){
                                console.log(err)
                                reject(err)
                            }
                            //recall promises will only return 1 value
                            resolve(results.length==1? results[0] : results)
                        }
                    ])
                })
        }
        ,qs:(...a)=>db.query(...(['series'  ].concat(a)) )
        ,series:(...a)=>db.qs(...a)
        ,qp:(...a)=>db.query(...(['parallel'].concat(a)) )
        ,parallel:(...a)=>db.qp(...a)
        ,q :(...a)=>db.qp(...a)
        ,table:{}//populated by schemize
        ,schemize(done){
            done=done||function(){}
            //actually ask the db what it has
              db.q("select table_catalog,table_schema,table_name,column_name,ordinal_position,column_default,is_nullable,data_type,character_maximum_length,character_octet_length,numeric_precision,numeric_scale,character_set_name,collation_name,column_type,column_key,extra,privileges,column_comment from information_schema.columns where table_schema=?",[MYSQL.config.connectionConfig.database],tables=>{
                tables.forEach(tbl=>{
                    if (!(tbl.table_name in db.table)) db.table[tbl.table_name]={}
                    if (!(tbl.column_name in db.table[tbl.table_name])) db.table[tbl.table_name][tbl.column_name]={}
                    db.table[tbl.table_name][tbl.column_name]=tbl
                })
                db.q("set global group_concat_max_len=65536",()=>done())
            })
        }
        ,attachCommonMethods(model,name,done){
            var priKey=_.filter(db.table[name],x=>x.column_key.match(/PRI/)).map(x=>x.column_name)
                ,fields=_.keys(db.table[name])
                ,fieldCount=fields.length
                ,where=(row,o={in:false})=>{
                    var whereSubs=[]
                        ,whereClause=_.map(_.pick(row,_.keys(db.table[name]) ) ,(v,k)=>{
                            whereSubs.push(k,v)
                            return _.isArray(v)? " ?? in (?) " : "??=?"
                        }).join(" and ")
                    return [whereClause,whereSubs]
                }

            _.defaults(model,{
                //common db verbs
                insert(rows,done){
                    rows=_.castArray(rows)
                    //this way preserves col order
                    var  insertCols=fields.reduce((set,part)=>set.concat( rows[0][part] ? part : []),[])
                        ,colL=insertCols.length
                    //the rows could be run through to assure they're all in the same key order...but hopefully they are from parent context
                    return db(`insert into ?? (${insertCols.map(x=>`\`${x}\``)})
                                values ${rows.map(r=>"("+"?".repeat(colL).split("").join(",")+")"  ).join(",")}`
                              , [name].concat(rows.map(r => _.values(_.pick(r, insertCols))).flatten())
                             ,done)
                }
                ,update(rows,done){
                    return db(..._.castArray(rows).reduce((queries,row)=>{
                        var [pk,whereSubs]=where(row)
                            ,tmp=_.unset(_.extend({},row),priKey)
                        return queries.concat([`update ?? set ? where ${pk} limit 1`,[name,tmp,...whereSubs]])
                    },[]),done)
                }
                ,delete(rows,done){
                    return db(..._.castArray(rows).reduce((queries,row)=>{
                        var [pk,whereSubs]=where(row)
                        return queries.concat([`delete from ?? where ${pk} limit 1`,[name,...whereSubs]])
                    },[]),done)
                }
                ,get(key,done){
                    var [wheres,subs]=where(_.isNumber(key) ? {[priKey[0]]:key} : key)
                    return db(`select * from ?? where ${wheres} ${key.limit && _.isInteger(key.limit)?`limit ${key.limit}`:''}`,[name,...subs],done)
                }
                ,get1(key,done){
                    if(!_.isObject(key)) key={[priKey[0]]:key}
                    key.limit=1
                    return model.get(key,done)
                }
            },  //where clause by field
               fields.reduce((set, field) => {
                   set[("get by " + field).toMethodName()] = (val, done) => {
                       return model.get({
                           [field]: val
                       }, done)
                   }
                   return set
               }, {})
            )
            done(model)
        }
    }

    Object.assign(db,opts)

    //allow db("select ...") in addition to db.q("select ...")
    Object.assign(db.q,db)
    db=db.q

    return db
}
