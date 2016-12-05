module.exports=function init(MYSQLPool,opts){
	var Promise = require("bluebird")
		,inFlow={
			series:function(calls,done=x=>x){
				//console.log("given",calls)
				return Promise.mapSeries(calls,x=>x())
					.then(done)
			}
			,parallel:function(calls,done=x=>x){
				return Promise.all(calls.map(x=>x()))
					.then(done)
			}
		}
		,_=require("lodash")
		,db
	db={
		 verbose:1
		,setOnce:(o)=>{
			var was=_.pick(db,_.keys(o))
			db.undo=()=>{
				Object.assign(db,was)
				delete db.undo
			}
			Object.assign(db,o)
			return db
		}
		,log:(query,rows,queryLine,took,db)=>{
			console.log(`query in ${took}s:`,query.sql)
		}
		,query:(flow='parallel',...queryInfo)=>{
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
				,isParallel=flow=='parallel'
				,aCxn
				,connectionGetter= then=>{
					if(isParallel || !aCxn){
						MYSQLPool.getConnection((err,dbi)=>{
							if(err) throw Error(err)
							else{
								aCxn=dbi
								then(aCxn)
							}
						})
					}
					else then(aCxn)
				}
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
					if(!v.length) v.push(null)
					//if I want to say "...where x in (?)",[ [] ] <- and I supply an empty array for the subtitution, it will err.  Replace this with a null, where it returns no results w/o erring
					v=v.map(x=> _.isArray(x) && x.length==0 ? null :x )
					set.substitute=v
					querySets.push(set)
					set=null
				}
			})
			
			var lastSet=querySets.length-1

			//form into async input function set
			querySets=querySets.map((qset,i)=>{
				//note connections are lazily retained, so this won't have real overhead once the pool is filled
				return ()=>new Promise((good,bad)=>{
					var t1=Date.now()
					connectionGetter(dbi=>{
						var query=dbi.query(qset.sql,qset.substitute,(err,rows)=>{
							//console.log(rows)
							if(isParallel || i==lastSet || err) dbi.release()//done querying
							var t2=Date.now()
								,took=((t2-t1)/1000).toFixed(3)
							if(isVerbose) db.log(query,rows,queryLine,took,db)
							//handle error better...
							if(err && isVerbose) console.error("BAD QUERY! this one:",query.sql,err)
							else{
								//did you hint you only want one row? If so, don't return a row, just the object
								var wantOnlyOne=!!qset.sql.match(/^\s*select/i)
									&& !!qset.sql.match(/limit\s+\b1\b\s*$/i)
								results[i]=wantOnlyOne ? rows[0] : rows
								//further, if you're a single-key, return value.
								if(wantOnlyOne){
									var k=Object.keys(results[i]||{})
									if(k.length==1)
										results[i]=results[i][k[0]]
								}
							}
							if(err) bad(err)
							else good(results)
						})
					})
				})
			})
			//call in desired flow & synchronicity, then place results as params to callback in original sequence provided.  This lets writer usefully name result vars in callback
			if(callback)
				inFlow[flow](
					querySets
					,x=>{
						db.undo && db.undo()
						callback(...results)
					}
				)
			else
				return new Promise((resolve,reject)=>
					inFlow[flow](
						querySets
						,asyncResults=>{
							db.undo && db.undo()
							//recall promises may only return 1 value
							resolve(results.length==1? results[0] : results)
						}
					)
					.catch(err=>reject(err))
				)
		}
		,qs:(...a)=>db.query(...(['series'  ].concat(a)) )
		,series:(...a)=>db.qs(...a)
		,qp:(...a)=>db.query(...(['parallel'].concat(a)) )
		,parallel:(...a)=>db.qp(...a)
		,q :(...a)=>db.qp(...a)
		,table:{}//populated by schemize
		,schemize(done){
			//actually ask the db what it has
			return db.q("select table_catalog,table_schema,table_name,column_name,ordinal_position,column_default,is_nullable,data_type,character_maximum_length,character_octet_length,numeric_precision,numeric_scale,character_set_name,collation_name,column_type,column_key,extra,privileges,column_comment from information_schema.columns where table_schema=?",[MYSQLPool.config.connectionConfig.database])
				.then(tables=>{
					tables && tables.forEach(tbl=>{
						if (!(tbl.table_name in db.table)) db.table[tbl.table_name]={}
						db.table[tbl.table_name][tbl.column_name]=tbl
					})
					if(done) done(db.table)
					else return db.table
				})
		}
		,attachCommonMethods(model,name){
			if(!_.keys(db.table).length) throw new Error("need information_schema from schemize() first!")
			else if(!db.table[name]) throw new Error(`cannot reference table ${name} in db!`)
			var priKey=_.filter(db.table[name],x=>x.column_key.match(/PRI/)).map(x=>x.column_name)
				,fields=_.keys(db.table[name])
				,nonPriFields=_.without(fields,...priKey)
				,fieldCount=fields.length
				,where=(row,o={in:false})=>{
					var whereSubs=[]
						,whereClause=_.map(_.pick(row,fields) ,(v,k)=>{
							whereSubs.push(k,v)
							return _.isArray(v)? " ?? in (?) " : "??=?"
						}).join(" and ")
					return [whereClause,whereSubs]
				}
				,toMethodName=function(str){
					return str
						.replace(/([a-z])([A-Z])/g,'$1 $2')
						.replace(/([^_])_([^_])/g,'$1 $2')
						.replace(/\w\S*/g, function toProperCase(txt){return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()})
						.split(" ").join("").split("")
						.reduce(function decapitalize(name,ltr,i){return name+(i==0? ltr.toLowerCase() : ltr)},"")
				}
				,num2pk=function(key){
					if(!_.isPlainObject(key)) key={[priKey[0]]:key,limit:1}
					return key
				}
			_.defaults(model,{
				 insert(rows,done){
					rows=_.castArray(rows)
					//this way preserves col order
					var  insertCols=fields.reduce((set,part)=>set.concat( rows[0][part] ? part : []),[])
						,colL=insertCols.length
					//the rows could be run through to assure they're all in the same key order...but hopefully they are from parent context
					return db(`insert into ?? (${insertCols.map(x=>`\`${x}\``)})
								values ${rows.map(r=>"("+"?".repeat(colL).split("").join(",")+")"  ).join(",")}`
							,[name].concat(_.flatten(rows.map(r => _.values(_.pick(r, insertCols)))))
							,done)
				}
				,update(rows,done){
					rows=_.castArray(rows)
					//traverse set once to see which columns are updated by which keys
					var sets={/*col:{priKeyVal:val,priKeyVal:val,...},...*/}
					rows.forEach(row=>{
						var changes=_.pick(row,nonPriFields)
							,priKeyVal=_.get(row,priKey)
						_.each(changes,(v,col)=>{
							if(!sets[col]) sets[col]={}
							sets[col][priKeyVal]=v
						})
					})
					//could traverse a second time and aggregate keys by same val per col
					var subs=[name]
						,sql=`update ?? set ${_.map(sets,(valo,col)=>{
							var q=`?? = case `
							subs.push(col)
							_.each(valo,(nuVal,whenPriKeyVal)=>{
								q+=`when ?? = ? then ? `
								subs.push(priKey[0],whenPriKeyVal,nuVal)
							})
							q+=" end "
							return q
						})} where ?? in (?) limit ${rows.length}`
					subs.push(priKey[0],rows.map(row=>row[priKey[0]]))
					return db(sql,subs,done)
				}
				,delete(keys,done){
					keys=_.castArray(keys).reduce((set,key)=>{
						if(_.isPlainObject(key)) key=key[priKey[0]]
						return set.concat(key)
					},[])
					return db(`delete from ?? where ?? in (?) limit ${keys.length}`,[name,...priKey,keys])
				}
				,get(key,done){
					key=num2pk(key)
					var [wheres,subs]=where(key)
					return db(`select * from ?? where ${wheres} ${key.limit && _.isInteger(key.limit) && key.limit>0 ?`limit ${key.limit}`:''}`,[name,...subs],done)
				}
			},  //where clause by field
				fields.reduce((set, field) => {
					set[toMethodName("get by " + field)] = (val, done) => {
						return model.get({
							[field]: val
						}, done)
					}
					return set
				}, {})
			)
			return model
		}
	}
	Object.assign(db,opts)
	//allow db("select ...") in addition to db.q("select ...")
	Object.assign(db.q,db)
	db=db.q
	return db
}