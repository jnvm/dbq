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
	,N=5e5
	
//test data
function setup(){
	var  x="insert into x values "+" ".repeat(N/10).split("").map(x=>"(0,rand()*10000)").join(",")
		,y="insert into y values "+" ".repeat(N/10).split("").map(x=>"(0,rand()*10000)").join(",")
	return db.qs(
		 "drop table if exists x"
		,"create table `x` (`id` int(10) auto_increment primary key,`d` int(10)/*,KEY `ddd` (`d`)*/)"
		,...(" ".repeat(10).split("").map(z=>x))
		,"drop table if exists y"
		,"create table `y` (`id` int(10) auto_increment primary key,`d` int(10)/*,KEY `ddd` (`d`)*/)"
		,...(" ".repeat(10).split("").map(z=>y))
	)
}

function getSome(flow){
	console.time(flow)
	return db[flow](
		 `select SQL_NO_CACHE sum(d),min(d),max(d) from x where id between ${N/16* 0+0} and ${N/16* 1}`
		,`select SQL_NO_CACHE sum(d),min(d),max(d) from x where id between ${N/16* 1+1} and ${N/16* 2}`
		,`select SQL_NO_CACHE sum(d),min(d),max(d) from x where id between ${N/16* 2+1} and ${N/16* 3}`
		,`select SQL_NO_CACHE sum(d),min(d),max(d) from x where id between ${N/16* 3+1} and ${N/16* 4}`
		,`select SQL_NO_CACHE sum(d),min(d),max(d) from x where id between ${N/16* 4+1} and ${N/16* 5}`
		,`select SQL_NO_CACHE sum(d),min(d),max(d) from x where id between ${N/16* 5+1} and ${N/16* 6}`
		,`select SQL_NO_CACHE sum(d),min(d),max(d) from x where id between ${N/16* 6+1} and ${N/16* 7}`
		,`select SQL_NO_CACHE sum(d),min(d),max(d) from x where id between ${N/16* 7+1} and ${N/16* 8}`
		,`select SQL_NO_CACHE sum(d),min(d),max(d) from x where id between ${N/16* 8+1} and ${N/16* 9}`
		,`select SQL_NO_CACHE sum(d),min(d),max(d) from x where id between ${N/16* 9+1} and ${N/16*10}`
		,`select SQL_NO_CACHE sum(d),min(d),max(d) from x where id between ${N/16*10+1} and ${N/16*11}`
		,`select SQL_NO_CACHE sum(d),min(d),max(d) from x where id between ${N/16*11+1} and ${N/16*12}`
		,`select SQL_NO_CACHE sum(d),min(d),max(d) from x where id between ${N/16*12+1} and ${N/16*13}`
		,`select SQL_NO_CACHE sum(d),min(d),max(d) from x where id between ${N/16*13+1} and ${N/16*14}`
		,`select SQL_NO_CACHE sum(d),min(d),max(d) from x where id between ${N/16*14+1} and ${N/16*15}`
		,`select SQL_NO_CACHE sum(d),min(d),max(d) from x where id between ${N/16*16+1} and ${N/16*16}`
	)
	.then(x=>db[flow](
		 `select SQL_NO_CACHE sum(d)*min(d)*max(d)*rand() from x`
		,`select SQL_NO_CACHE sum(d)*min(d)*max(d)*rand() from x`
		,`select SQL_NO_CACHE sum(d)*min(d)*max(d)*rand() from x`
		,`select SQL_NO_CACHE sum(d)*min(d)*max(d)*rand() from x`
		,`select SQL_NO_CACHE sum(d)*min(d)*max(d)*rand() from x`
		,`select SQL_NO_CACHE sum(d)*min(d)*max(d)*rand() from x`
		,`select SQL_NO_CACHE sum(d)*min(d)*max(d)*rand() from x`
		,`select SQL_NO_CACHE sum(d)*min(d)*max(d)*rand() from x`
		,`select SQL_NO_CACHE sum(d)*min(d)*max(d)*rand() from x`
		,`select SQL_NO_CACHE sum(d)*min(d)*max(d)*rand() from x`
		,`select SQL_NO_CACHE sum(d)*min(d)*max(d)*rand() from x`
		,`select SQL_NO_CACHE sum(d)*min(d)*max(d)*rand() from x`
		,`select SQL_NO_CACHE sum(d)*min(d)*max(d)*rand() from x`
		,`select SQL_NO_CACHE sum(d)*min(d)*max(d)*rand() from x`
		,`select SQL_NO_CACHE sum(d)*min(d)*max(d)*rand() from x`
		,`select SQL_NO_CACHE sum(d)*min(d)*max(d)*rand() from x`
	))/*
	.then(x=>db[flow](
		 `delete from x where id between ${N/5*0+0} and ${N/5*1} and !(d%3)`
		,`delete from x where id between ${N/5*1+1} and ${N/5*2} and !(d%3)`
		,`delete from x where id between ${N/5*2+1} and ${N/5*3} and !(d%3)`
		,`delete from x where id between ${N/5*3+1} and ${N/5*4} and !(d%3)`
		,`delete from x where id between ${N/5*4+1} and ${N/5*5} and !(d%3)`
	))
	.then(x=>db[flow](
		 "insert into x select 0,d from x where   id%7  limit 10000"
		,"insert into y select 0,d from y where   id%7  limit 10000"
		,"insert into x select 0,d from x where !(id%7) limit 10000"
		,"insert into y select 0,d from y where !(id%7) limit 10000"
	))*/
	.then(x=>{
		console.timeEnd(flow)
	})
}

var n=20
setup().then(()=>{
	async.series(
		" ".repeat(n).split("").reduce((set,part)=>set.concat(
			done=>{
				getSome("parallel")
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
})