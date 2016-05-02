# dbq

`dbq` = (`node-mysql` + `async` for batch execution & flow control) / (a preference for brevity &times; medium naiveté).

Example: two queries, executed in parallel, two results:
```javascript
db("select * from ricks order by rickness desc limit 1"
,"select * from mortys where dim=? order by mortyness desc limit 1",["c-137"]
,(rickest,mortyest)=>/*fiddle*/)
```

### [Callbacks or Promises](#callbacks-or-promises)

Pass a function as the last input, and that will receive query results as inputs in the order supplied:
```javascript
db("select * from user where name=?",['morty']
,"select name,volume from dims where dim=?",['c-137']
,(morty,dim)=>{/*fiddle*/})
```

If the last input isn't a function, a promise is returned, so is `then`able:
```javascript
db("select * from jerrys where dim=?",["c-137"]
,"select * from ricks where dim=?",["J19ζ7"]
).then(([jerry,doofusRick])=>{//a promise resolves to 1 value, but es6 destructuring can separate them
       //fiddle
})
//if it's thenable, you can catch, too
.catch(errorHandler)
//but it's already going to log out when errors happen anyway
```
### [Series or Parallel](#series-or-parallel)
It can execute queries in series or parallel (assuming you have connection pooling on).
```javascript
//Parallel looks like this:
db(    //could also have been db.parallel or db.qp or db.q
     "select * from user"
    ,"select * from book"
    ,"select * from dinosaur"
).then(([users,books,dinosaurs])=>{/*fiddle*/})

//series would be:
db.qs( //or db.series
     "update cat set living=false"
    ,"update treaty set active=true where title='Spider Peace'"
    ,"insert into cat2 select * from cat where living=false"
)
```
[node-mysql's ?-substitution syntax](https://github.com/felixge/node-mysql#escaping-query-values) is also allowed adjacently, as needed:
```javascript
db(     "select * from grandpa where name=?",["rick"]
    ,"select * from council"//note no substitution needed here, so no [] is supplied
    ,"select * from morty where ?",[{alignment:"evil"}]
    ,"select * from dinosaur"
).then(fiddle)
```

### [Return Shortcuts](#return-shortcuts)
Queries are often performed to retrieve single value results, not arrays of objects.

If you end a query with `limit 1`, it will take that one result out of its result `[]`, returning just the row `{}`.

If you _also_ supply only one `select` clause column, the result will be just that `value`, not a `{key:value}`.

### [Schemize](#schemize)
If your credentials have `information_schema` access, `db.schemize()` will query it and put a representation of the database's tables and their columns at `db.table` for easy referencing elsewhere in code.

### [Setup & Options](#setup-options)
Any key:value passed to the `db` options object is `Object.assign`ed to `db`, so will overwrite defaults. Useful to create your own logging.  For example, I like to add an `ellipsize` option to it & the logger so I can see partial or full queries if debugging.
```javascript
var mysql=require("mysql").createPool({
               host:'x',user:'x',password:'x',database:'x'
              ,useConnectionPooling:true//allow parallel querying!
              ,connectionLimit:16
              ,connectTimeout:15*60*1000
          })
    ,db=require("dbq")(mysql,{//pass in node-mysql initialized above, then an options {}
        //option:[default]
        ,verbose:true// console.log queries as they happen?
        ,log:(query,rows,queryLine,took,db)=>{//maybe you want to customize how queries are logged
            console.log(`query in ${took}s:`,query.sql)
        }
    })
```

### [Common Methods](#common-methods)
If you want, you can pass an object and its table name into ```db.attachCommonMethods(model,name,done)``` to attach an opinionated:
```javascript
insert(rows[,done])
update(rows[,done])//find record by passing in primary key, then updating all non-primary, defined columns
delete(rows[,done])
get(key[,done]) /*key: If a #, the 1-col primary key; user.get(1)
    Else,key creates the WHERE clause: {
            col1:val
            [,col2:val]...etc. Note if val is ever [an,array,...] the IN syntax will be used
            [,limit:# if supplied] so...don't be weird and name your column a MySQL keyword
        }
*/
get1(key[,done])//adds {limit:1} to key
//and a
getBy${FieldName}(key[,done])// per column in the table, assuming schemize() has run to know this.
```
All of which use proper ?-substitution, support promise/callback responses, and ```{single}```/```[many]``` things supplied at once.

Anything more complex, consider writing clear SQL.