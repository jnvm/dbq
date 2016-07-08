/* is parallel faster?

https://docs.google.com/spreadsheets/d/1KRH39wRZxmX51e_avDwTQLFPGownPB0l7PojV8q_HfA/edit?usp=sharing

*/

//setup
var os=require("os")
var mysql=require("mysql").createPool({
			 user:'anonymous',password:'',database:'test'
			,useConnectionPooling:true
			,connectionLimit:os.cpus().length
			,connectTimeout:15*60*1000
		})
	,db=require("./dbq")(mysql,{log:()=>{}})
	,async=require("async")
	
//test data
function setup(){
	var n=5e4
	return db.qs(
		 "drop table if exists x"
		,"create table `x` (`id` int(10) auto_increment primary key,`d` int(10))"
		,"insert into x values "+" ".repeat(n).split("").map(x=>"(0,rand()*10000)").join(",")
		,"drop table if exists y"
		,"create table `y` (`id` int(10) auto_increment primary key,`d` int(10))"
		,"insert into y values "+" ".repeat(n).split("").map(x=>"(0,rand()*10000)").join(",")		
	)
}

function getSome(flow){
	console.time(flow)
	return db[flow](
		 `select SQL_NO_CACHE * from x where  (id%2)`
		,`select SQL_NO_CACHE * from x where !(id%5)`
		,`select SQL_NO_CACHE * from x where  (id%7)`
		,`select SQL_NO_CACHE * from x where !(id%19)`
		,`select SQL_NO_CACHE * from y where  (id%2)`
		,`select SQL_NO_CACHE * from y where !(id%5)`
		,`select SQL_NO_CACHE * from y where  (id%7)`
		,`select SQL_NO_CACHE * from y where !(id%19)`
		,`select SQL_NO_CACHE * from x
		  inner join y on x.id=y.id 
		  limit 10000`
	)
	.then(x=>db[flow](
		 "insert into x select 0,d from x where id%2 limit 10000"
		,"insert into y select 0,d from y where id%2 limit 10000"
		,"insert into x select 0,d from x where !(id%7) limit 10000"
		,"insert into y select 0,d from y where !(id%7) limit 10000"
	))
	.then(x=>db[flow](
		 "delete from x where id%2 limit 10000"
		,"delete from y where id%2 limit 10000"
		,"delete from x where !(id%7) limit 10000"
		,"delete from y where !(id%7) limit 10000"
	))
	.then(x=>{
		console.timeEnd(flow)
	})
}

var n=20
async.series(
	" ".repeat(n).split("").reduce((set,part)=>set.concat(
		done=>{
			setup()
				.then(()=>getSome("parallel"))
				.then(setup)
				.then(()=>getSome("series"))
				.then(()=>{
					console.log("--------------------")
					done()
				})
		}
	),[])
,()=>{
	process.exit()
})