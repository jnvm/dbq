[![Coverage Status](https://coveralls.io/repos/github/jnvm/dbq/badge.svg?branch=master)](https://coveralls.io/github/jnvm/dbq?branch=master)
[![npm](https://img.shields.io/npm/dm/dbq.svg?maxAge=86400&label=%F0%9F%93%A5)](http://npm-stat.com/charts.html?package=dbq)
[![npm](https://img.shields.io/npm/dt/dbq.svg?maxAge=86400&label=%CE%A3%F0%9F%93%A5)](http://npm-stat.com/charts.html?package=dbq)
[![GitHub stars](https://img.shields.io/github/stars/jnvm/dbq.svg?label=%E2%98%85&maxAge=86400)](https://github.com/jnvm/dbq/stargazers)
[![GitHub watchers](https://img.shields.io/github/watchers/jnvm/dbq.svg?label=%E0%B2%A0_%E0%B2%B0%E0%B3%83&maxAge=86400)](https://github.com/jnvm/dbq/watchers)
[![](https://img.shields.io/github/issues-raw/jnvm/dbq.svg?maxAge=86400&label=%E2%9A%A0)](https://github.com/jnvm/dbq/issues)
[![](https://img.shields.io/badge/SLOC-%3C250-brightgreen.svg)](https://github.com/jnvm/dbq/blob/master/dbq.js)
[![Build Status](https://travis-ci.org/jnvm/dbq.svg?branch=master)](https://travis-ci.org/jnvm/dbq)
[![David](https://img.shields.io/david/jnvm/dbq.svg?maxAge=3600)]()
![dbq logo](https://cldup.com/kKMuXfEQzP.svg)

`dbq` = ([`mysql`](https://github.com/felixge/node-mysql) + (async || [`promises`](https://github.com/petkaantonov/bluebird) for batch execution flow control)) / (brevity &times; medium naiveté).

##### Table of Contents
* [Example](#example)
* [Callbacks or Promises](#callbacks-or-promises)
* [Series or Parallel](#series-or-parallel)
* [Return Shortcuts](#return-shortcuts)
* [Schemize](#schemize)
* [Setup & Options](#setup--options)
* [Common Methods](#common-methods)
* [Caveats](#caveats)


### Example
Four queries, [executed in parallel](https://github.com/mysqljs/mysql#executing-queries-in-parallel), four results:
```javascript
db(  "select * from ricks order by rickness desc limit 1"
	,"select * from mortys where dim=? order by mortyness desc limit 1",["c-137"]
	,"select * from gazorpazorpians where father=?",["Morty"]
	,"select * from donors where recipient=? and organ=?",["Shrimply Pibbles","heart"]
,(rickest,mortyest,mortyJr,heartDonors)=>/*fiddle*/)
```
[mysql's ?-substitution syntax](https://github.com/felixge/node-mysql#escaping-query-values) to prevent SQL injection is allowed as needed in adjacent arrays (illustrated here):
```javascript
                                  /*   ┌──⩤───┐                      */
db(  "select * from grandpa where name=?",["rick"]
	,"select * from zones where ?? in (?)",['allowed',['flarping','unflarping']
	,"select * from council" /* ┌────⩤─────────────┬──── = ─┐        */
	,"select * from morty where ? and pets=?",[{alignment:"evil"},0]
    ,"select * from cronenberg"       /*   └─⩤────────────────────┘  */	
                             //↑ note no substitution needed here; no [] supplied
).then(fiddle)
```

### Callbacks or Promises

Pass a function as the last input, and that will receive query results as inputs in the order supplied:
```javascript
db("select * from user where name=?",['morty'] //morty query (1)
,"select name,volume from dims where dim=?",['c-137'] //dimension query (2)
// ↓(1)  ↓(2)
,(morty,dim)=>{/*fiddle*/})
```

If the last input isn't a function, a [bluebird promise](https://github.com/petkaantonov/bluebird#introduction) is returned, so is `then`able:
```javascript
db("select * from jerrys where dim=?",["c-137"]
,"select * from ricks where dim=?",["J19ζ7"]
).then(([jerry,doofusRick])=>{
/* a promise resolves to 1 value but es6 destructuring separates them */
})
//if it's thenable, you can catch, too
.catch(errorHandler)
//but it's already going to message when errors happen anyway
```
### Series or Parallel
It can execute queries in series or parallel (assuming you have [connection pooling](https://github.com/mysqljs/mysql#pooling-connections) on).
```javascript
//Parallel looks like this:
db(    //could also have been db.parallel or db.qp or db.q
	 "select * from user"
	,"select * from book"
	,"select * from dinosaur"
).then(([users,books,dinosaurs])=>{/*fiddle*/})

//series would be:
db.series( //or db.qs
	 "update cat set living=false"
	,"update treaty set active=true where title='Spider Peace'"
	,"insert into cat2 select * from cat where living=false"
)
```
Note series queries share the same connection, allowing connection-dependent features, like temp tables, variables, and transactions.

Below is a run of `test.js` on 1, 4, and 16 core boxes in series and parallel. Depending on hardware and the types of queries you run, query speed can be increased appreciably. Note no meaningful difference for one core.
[![alt text](https://docs.google.com/spreadsheets/d/1KRH39wRZxmX51e_avDwTQLFPGownPB0l7PojV8q_HfA/pubchart?oid=1361741281&format=image "benchmark test")](https://docs.google.com/spreadsheets/d/1KRH39wRZxmX51e_avDwTQLFPGownPB0l7PojV8q_HfA/pubchart?oid=1361741281&format=image)


### Return Shortcuts
Queries are often performed to retrieve single value results, not arrays of objects.

If you end a query with `limit 1`, it will take that one result out of its result `[]`, returning just the row `{}`.

If you _also_ supply only one `select` clause column, the result will be just that `value`, not a `{key:value}`.

### Schemize
If your credentials have `information_schema` access, `db.schemize()` will query it and put a representation of the database's tables and their columns at `db.table` for easy referencing elsewhere in code.

### Setup & Options
```javascript
var mysql=require("mysql").createPool({
			   host:'x',user:'x',password:'x',database:'x'
			  ,useConnectionPooling:true//allow parallel querying!
			  ,connectionLimit:16
			  ,connectTimeout:15*60*1000
		  })
	,db=require("dbq")(mysql,{//pass in node-mysql pool initialized above, then an options {}
		//option:[default]
		,verbose:true// console.log queries as they happen?
		,log:(query,rows,queryLine,took,db)=>{//maybe you want to customize how queries are logged
			console.log(`query in ${took}s:`,query.sql)
		}
	})
```

`db.setOnce({})` is a chainable function that allows you to set properties that will be reversed after the next query set:
```javascript
//say query logging is normally off
db.verbose=false
//but you want to check a specific call:
db.setOnce({verbose:true})("select * from meeseeks").then(lookitMee=>{/* etc */})
//next call will be back to normal
db("select * from friends where name=?",['Bird Person']).then(birdPers=>/**/)
```

### Common Methods
If you want, you can pass an object and its table name into ```db.attachCommonMethods(model,name,done)``` to attach an opinionated:
```javascript
insert(rows[,done])//rows=[{},{},...] / {col1name:val,col2name...}
update(rows[,done])//find by primary key in rows, update all other cols supplied
delete(rows[,done])//find by primary key in rows, delete
get(key[,done]) /*
	key: If not an {}, the 1-col primary key: user.get(1); user.get('schwify')
	Else, key creates the WHERE clause: {
			col1:val
			[,col2:val]...etc. If val is ever [an,array], uses IN syntax
			[,limit:# if supplied] so...don't be weird & name your column a MySQL keyword
		}
*/
getBy${FieldName}(key[,done])// per column in the table, assuming schemize() has run to know this.
```
All of which use proper ?-substitution, support promise/callback responses, and ```{single}```/```[many]``` things supplied at once.

##### How do I sort, offset, group by, _____?
Anything more complex, [consider just writing clear SQL](https://www.youtube.com/watch?v=mIoKRyLcIjo&t=4m), placing reused queries in descriptively named functions.  There's a reason SQL is its own language.

### Caveats

* **variables and temp tables across multiple connections** - since parallel execution requires a connection pool, this means parallel queries will occur across different connections,
_which_ means locally defined variables, transactions, and temporary tables have no guarantee of existing between queries, since they're connection-local.
So...define your variables in code, not queries, and consider refactoring or phrasing in series before reaching for connection-dependent features.
* **multiple cores** - if your db is operating with only one core, you won't benefit meaningfully from running queries in parallel with a connection pool.  2+ cores and you will.  It'd also be appropriate to only have as many connections as cores.  See the `test.js` for [benchmark numbers](https://docs.google.com/spreadsheets/d/1KRH39wRZxmX51e_avDwTQLFPGownPB0l7PojV8q_HfA/edit?usp=sharing), where the db was on the same server as the app, so the local core count was relevant.
* **but isn't node single-threaded?** Yes! But db requests go out to a separate system, node makes the request and receives the data.  And mysql / mariadb can handle multiple queries at once, so why not supply them when you can?