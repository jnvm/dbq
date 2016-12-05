var mocha=require("mocha")
	,expect=require("chai").expect
	,mysql=require("mysql")
	,db=false
	,goodCreds={
		user: process.env.TRAVIS ? 'root':'x'
		,password: ''
		,database: 'test'
		,useConnectionPooling: true
		,connectionLimit: 16
		,connectTimeout: 15 * 60 * 1000
	}

describe("dbq",function(){
	
	var data=" ".repeat(5000).split("").map(x=>"(0,'something',now())").join(",")
	
	beforeEach(()=>{
		db=require("./dbq")(mysql.createPool(goodCreds),{verbose:false})
		return db.series(
			`drop table if exists blah`
			,`create table blah (
					blah_id int auto_increment primary key,
					thing varchar(50) default 'ha',
					created timestamp default current_timestamp
				)
			`
			,"insert into blah values "+data
		)
	})
	afterEach(()=>{
		return db=undefined
	})
	
	after(()=>{
		return require("./dbq")(mysql.createPool(goodCreds),{verbose:false})("drop table if exists blah")
	})
	
	it("should be able to connect to db & instantiate a pool given a valid connection",ok=>{
		//successful beforeEach is the test
		expect(db).to.not.be.false;
		ok()
	})
	it("should err when unable to get a connection",ok=>{
		var pool=require("mysql").createPool(goodCreds)
		pool.getConnection= (cb)=>cb(new Error("no connection"))
		
		db=require("./dbq")(pool,{verbose:true})
		db("select * from blah")
		.catch((x)=>{
			expect(x).to.be.an('error')
			ok()
		})

	})
	it("should allow a chainable setOnce() call that undoes upon resolution as promise",()=>{
		db.verbose=true
		var origConsoleLog=console.log
			,logCalls=0
		global.console.log=function(){logCalls++}
		return db.setOnce({verbose:false})("select * from blah").then(res=>{
			expect(db.verbose).to.be.true
			expect(logCalls).to.equal(0)
			global.console.log=origConsoleLog
		})
	})
	it("should allow a chainable setOnce() call that undoes upon resolution as callback",ok=>{
		db.verbose=true
		var origConsoleLog=console.log
			,logCalls=0
		global.console.log=function(){logCalls++}
		db.setOnce({verbose:false})("select * from blah",res=>{
			expect(db.verbose).to.be.true
			expect(logCalls).to.equal(0)
			global.console.log=origConsoleLog
			ok()
		})
	})	
	

	describe("querying",function(){
		it("should run a query for a few rows and columns, returning [{},{},...]",()=>{
			return db("select * from blah").then(res=>{
				expect(res).to.be.an("array")
				expect(res).to.have.length.above(1)
				expect(res[0]).to.be.an('object')
				expect(res[0]).to.have.keys('blah_id','thing','created')
			})
		})
		it("should run a query expecting 1 result of multiple columns and return an {}",()=>{
			return db("select * from blah limit 1").then(res=>{
				expect(res).to.be.an('object')
				expect(res).to.have.keys('blah_id','thing','created')
			})
		})
		it("should run a query expecting 1 result of 1 column and return a value",()=>{
			return db("select blah_id from blah limit 1").then(res=>{
				expect(res).to.be.a('number')
			})
		})
		it("should run a query with straight ?-[] substitutions",()=>{
			return db("select * from blah where blah_id=? or blah_id=? order by blah_id asc",[1,8]).then(res=>{
				expect(res).to.be.an('array')
				expect(res).to.have.length(2)
				expect(res[0]).to.have.property('blah_id',1)
				expect(res[1]).to.have.property('blah_id',8)
			})
		})
		it("should interpret [[#,#,#]] sub as a WHERE IN clause",()=>{
			return db("select * from blah where blah_id in (?) ",[[1,2,3,4,5]]).then(res=>{
				expect(res).to.be.an('array')
				expect(res).to.have.length(5)
			})
		})
		it("should interpret [[]] as a WHERE in NULL",()=>{
			return db("select * from blah where blah_id in (?) ",[[]]).then(res=>{
				expect(res).to.be.an('array')
				expect(res).to.have.length(0)
			})
		})
		it("should interpret [] as WHERE in NULL",()=>{
			return db("select * from blah where blah_id in (?) ",[]).then(res=>{
				expect(res).to.be.an('array')
				expect(res).to.have.length(0)
			})
		})
		it("should run a query with ?-{} subsitutions",()=>{
			return db("select * from blah where ? or ? order by blah_id asc",[{blah_id:1},{blah_id:8}]).then(res=>{
				expect(res).to.be.an('array').with.length(2)
				expect(res[0]).to.have.property('blah_id',1)
				expect(res[1]).to.have.property('blah_id',8)				
			})
		})
		it("will reuse connection in series",()=>{
			return db.series(
				 `select (@x:=10) x,connection_id() id limit 1`
				,`select @x       x,connection_id() id limit 1`
			).then(res=>{
				expect(res[0]).to.deep.eq(res[1])
			})
		})
		it("will not reuse connection in parallel",()=>{
			return db.parallel(
				 `select (@x:=10) x limit 1`
				,`select @x limit 1`
			).then(res=>{
				expect(res[0]).to.not.eq(res[1])
			})
		})
		it("should run 10 queries in series",()=>{
			return db.series(
				 `select count(*) n from blah limit 1`
				,`insert into blah values (0,'stuff',now())`
				,`select count(*) n from blah limit 1`
				,`insert into blah values (0,'stuff',now())`
				,`select count(*) n from blah limit 1`
				,`insert into blah values (0,'stuff',now())`
				,`select count(*) n from blah limit 1`
				,`insert into blah values (0,'stuff',now())`
				,`select count(*) n from blah limit 1`
				,`insert into blah values (0,'stuff',now())`
			).then(res=>{
				var n=res[0]
				expect(res[2]).to.eq(++n)
				expect(res[4]).to.eq(++n)
				expect(res[6]).to.eq(++n)
				expect(res[8]).to.eq(++n)
			})
		})
		it("should run 10 queries in parallel",()=>{
			return db.parallel(
				 `select (@a:=1),@b,@c,@d,@e,@f,@g,@h,@i,@j limit 1`
				,`select @a,(@b:=1),@c,@d,@e,@f,@g,@h,@i,@j limit 1`
				,`select @a,@b,(@c:=1),@d,@e,@f,@g,@h,@i,@j limit 1`
				,`select @a,@b,@c,(@d:=1),@e,@f,@g,@h,@i,@j limit 1`
				,`select @a,@b,@c,@d,(@e:=1),@f,@g,@h,@i,@j limit 1`
				,`select @a,@b,@c,@d,@e,(@f:=1),@g,@h,@i,@j limit 1`
				,`select @a,@b,@c,@d,@e,@f,(@g:=1),@h,@i,@j limit 1`
				,`select @a,@b,@c,@d,@e,@f,@g,(@h:=1),@i,@j limit 1`
				,`select @a,@b,@c,@d,@e,@f,@g,@h,(@i:=1),@j limit 1`
				,`select @a,@b,@c,@d,@e,@f,@g,@h,@i,(@j:=1) limit 1`
			).then(res=>{
				var sum=res.map(r=>Object.values(r).reduce((set,part)=>set+(part||0),0))
					.reduce((set,part)=>set+(part||0),0)
				expect(sum).to.eq(10)
			})
		})
		it("should run 10 queries with various subsitutions properly attributed",()=>{

			return db.parallel(
				 `select * from blah where ?`,[{blah_id:100}]
				,`select * from blah where blah_id=?`,[200]
				,`select * from blah where ? and ?`,[{blah_id:300},{thing:'something'}]
				,`select * from blah where blah_id in (?)`,[[400,500,600,700]]
				,`select ?? from  ??  where ? and (? or blah_id in (?))`,['created','blah',{thing:'something'},{blah_id:800},[900,1000]]
			).then(res=>{
				expect(res.reduce((sum,r)=>sum+r.length,0)).to.equal(10)
			})
		})
		it("should succeed using callbacks",done=>{
			db(`select * from blah`,res=>{
				expect(res).to.be.an('array')
				done()
			})
		})
		it("should end up in unhandledRejection on error when using callbacks",done=>{
			process.once('unhandledRejection',err=>{
				expect(err).to.be.an('error')
				expect(err.message).to.match(/test\.blahx/)
				done()
			})
			db(`select * from blahx`,res=>{
				//will never get here. Program more defensively if this is a problem.
			})
		})
		it("should succeed using promises",()=>{
			return db("select * from blah limit 2").then(res=>{
				expect(res).to.be.an('array').of.length(2)
			})
		})
		it("should fail catchably using promises",()=>{
			return db("select * from blahx limit 2").then(res=>{/* never get here*/})
				.catch(err=>{
					expect(err).to.be.an('error')
				})
		})
		it("should log out if verbose",()=>{
			db.verbose=true
			var calls=0
			db.log=(x)=>{
				db.verbose=false
				calls++
			}
			return db("select * from blah limit 2").then(()=>{
				expect(calls).to.eq(1)
			})
		})
		it("should console.log out errors if verbose",(done)=>{
			var origConsoleLog=console.log
				,origConsoleError=console.error
				,logCalls=0
				,errCalls=0
			db.verbose=true
			global.console.log=function(){logCalls++}
			global.console.error=function(){errCalls++}
			db("select * from blahx")
				.catch(err=>{
					expect(err).to.be.an('error')
					expect(logCalls).to.eq(1)
					expect(errCalls).to.eq(1)
					global.console.log=origConsoleLog
					global.console.error=origConsoleError
					db.verbose=false
					done()
				})
		})		
	})
	describe("schemize",function(){
		it("should get a schema and put it at .table via promise",()=>{
			return db.schemize().then(()=>{
				expect(db.table).to.have.property('blah')
				expect(db.table.blah).to.have.keys('blah_id','thing','created')
				expect(db.table.blah.blah_id).to.have.property('column_name','blah_id')
			})
		})
		it("should get a schema and put it at .table via callback",()=>{
			return db.schemize(()=>{
				expect(db.table).to.have.property('blah')
				expect(db.table.blah).to.have.keys('blah_id','thing','created')
				expect(db.table.blah.blah_id).to.have.property('column_name','blah_id')
			})
		})		
	})
	describe("attachCommonMethods",function(){
		it("should fail if not already schemized",()=>{
			var blah={}
			expect(()=>db.attachCommonMethods(blah,'blah')).to.throw(Error)
		})
		it("should fail if name does not correspond to a table in schema",()=>{
			var blah={}
			return db.schemize().then(()=>{
				expect(()=>db.attachCommonMethods(blah,'blahx')).to.throw(/cannot reference/)
			})
		})
		describe("(once initialized)",function(){
			var blah,row
			beforeEach((done)=>{
				blah={}
				row={blah_id:0,created:new Date(),thing:'something'}
				db.schemize().then(()=>{
					db.attachCommonMethods(blah,"blah")
					done()
				})
			})
			
			function insert(n){
				return blah.insert(" ".repeat(n).split("").map(x=>row))
			}

			it("should attach common methods to a supplied object",()=>{
				expect(blah).to.contain.keys('get','delete','insert','update','getByBlahId','getByCreated','getByThing')
			})
			it("should insert 1",()=>{
				var n=1
				return insert(n).then(res=>{
					expect(res).to.be.an('object')
						.to.contain.keys({insertId:5001,affectedRows:n})
				})
			})
			it("should insert 10",()=>{
				var n=10
				return insert(n).then(res=>{
					expect(res).to.be.an('object')
						.to.contain.keys({affectedRows:n})
				})
			})
			it("should get 1 by get(#)",()=>{
				var blah_id=1234
				return blah.get(blah_id).then(res=>{
						row.blah_id=blah_id
						expect(res).to.be.an('object')
							.to.contain.keys(row)
					})
			})
			it("should get 2 by get({k:v})",()=>{
				var n=2
				return blah.get({thing:'something',limit:n})
					.then(res=>{
						expect(res).to.be.an('array')
							.of.length(n)
						expect(res[0]).to.contain.keys({thing:'something'})
					})
			})
			it("should get 3 using {col:[v1,v2,v3]}",()=>{
				var blah_ids=[123,456,789]
				return blah.get({blah_id:blah_ids}).then(res=>{
					expect(res).to.be.an('array')
						.of.length(blah_ids.length)
					expect(res.map(x=>x.blah_id)).to.include.members(blah_ids)
				})
			})
			it("should get 10 by get({k:v})",()=>{
				var n=10
				return blah.get({thing:'something',limit:n})
					.then(res=>{
						expect(res).to.be.an('array')
							.of.length(n)
					})				
			})
			it("should getByFieldName",()=>{
				return blah.getByThing('something').then(res=>{
						expect(res).to.be.an('array')
							.to.have.length.of.at.least(1)
						expect(res[0]).to.contain.keys({thing:'something'})
					})
			})
			it("should update 1 column in 1 row",()=>{
				var it={thing:'fudge',blah_id:1234}
				return blah.update(it).then(res=>{
					expect(res).to.contain.keys({affectedRows:1})
					return blah.get(it.blah_id)
				})
				.then(res=>{
					expect(res.thing).to.equal(it.thing)
				})
			})
			it("should update multiple columns in 10 rows",()=>{
				var created=new Date(Date.now()-24*3600*1000)
					,them=[
						 {thing:'a',created,blah_id:100}
						,{thing:'b',created,blah_id:110}
						,{thing:'c',created,blah_id:120}
						,{thing:'d',created,blah_id:130}
						,{thing:'e',created,blah_id:140}
						,{thing:'f',created,blah_id:150}
						,{thing:'g',created,blah_id:160}
						,{thing:'h',created,blah_id:170}
						,{thing:'i',created,blah_id:180}
						,{thing:'j',created:new Date(Date.now()+30*1000),blah_id:190}
					]
				return blah.update(them)
					.then(res=>blah.get({blah_id:them.map(x=>x.blah_id)}))
					.then(themUpdated=>{
						var thatOne=x=>x.blah_id==190
						expect(themUpdated.map(x=>x.thing)).to.deep.equal(them.map(x=>x.thing))
						expect(themUpdated.filter(thatOne)[0].created - them.filter(thatOne)[0].created).to.be.below(1)
					})
			})
			it("should delete 1 by delete(#)",()=>{
				var blah_id=1234
				return blah.delete(blah_id).then((x)=>{
					expect(x).to.contain.keys({affectedRows:1})
					return blah.get(blah_id)
				})
				.then(x=>expect(x).to.be.undefined)
			})
			it("should delete 1 by delete({col:#})",()=>{
				var blah_id=1234
				return blah.delete({blah_id}).then((x)=>{
					expect(x).to.contain.keys({affectedRows:1})
					return blah.get(blah_id)
				})
				.then(x=>expect(x).to.be.undefined)
			})			
			it("should delete 10 by delete({col:[#,#,#...]})",()=>{
				var them=[123,456,789,987,654,321,147,258,369,951]
				return blah.delete({blah_id:them}).then(x=>{
					expect(x).to.contain.keys({affectedRows:1})
					return blah.get({blah_id:them})
				})
				.then(x=>{
					expect(x).to.have.length(0)
				})
			})
		})
	})
})