/* is parallel faster? */

//setup
var mysql=require("mysql").createPool({
			 user:'anonymous',password:'',database:'test'
			,useConnectionPooling:true
			,connectionLimit:16
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
		...(" ".repeat(8).split("").reduce((set,part,i)=>set.concat([
			 `select SQL_NO_CACHE * from x where  (id%${i})`
			,`select SQL_NO_CACHE * from x where !(id%${i})`
			,`select SQL_NO_CACHE * from y where  (id%${i})`
			,`select SQL_NO_CACHE * from y where !(id%${i})`			
			,`select SQL_NO_CACHE * from x
			  inner join y on x.id=y.id 
			  limit 10000`
			,"insert into x select 0,d from x where d%3 limit 10000"
			,"insert into y select 0,d from x where d%3 limit 10000"
			,"delete from x where d%2"
			,"delete from y where d%2"
		]),[]))
	)
	.then(([a,b,c,d])=>{
		console.timeEnd(flow)
	})
}

var n=10
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
/* results:

raw:
1 core; pointless
parallel	4092.730ms	series	4165.935ms
parallel	3674.418ms	series	3779.585ms
parallel	3535.438ms	series	3804.333ms
parallel	3577.721ms	series	3894.312ms
parallel	3695.406ms	series	3794.311ms
parallel	3352.661ms	series	3837.039ms
parallel	3357.821ms	series	3774.351ms
parallel	3413.915ms	series	3734.145ms
parallel	3472.906ms	series	3804.200ms
parallel	3452.951ms	series	4212.357ms
16 cores, 10 tests:
parallel	1578.591ms	series	2883.408ms
parallel	1575.757ms	series	2966.788ms
parallel	2173.732ms	series	3210.637ms
parallel	1414.963ms	series	3069.376ms
parallel	1462.553ms	series	3205.543ms
parallel	1535.161ms	series	3239.873ms
parallel	1753.169ms	series	3298.530ms
parallel	1600.342ms	series	3346.219ms
parallel	1487.767ms	series	3534.954ms
parallel	1642.281ms	series	3307.191ms

sheets formated:
16 cores:		
parallel (ms)	parallel / series
		series (ms)	
1579	2883	54.75%
1576	2967	53.11%
2174	3211	67.70%
1415	3069	46.10%
1463	3206	45.63%
1535	3240	47.38%
1753	3299	53.15%
1600	3346	47.83%
1488	3535	42.09%
1642	3307	49.66%

*/