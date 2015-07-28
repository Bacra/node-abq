var cDebug = require('debug');
var debug = cDebug('abq:test');
// cDebug.enable('abq');
// cDebug.enable('abq:test');

var logfile		= __dirname+'/tmp/mulit_process.log';
var lognum		= 100000;
var clientnum	= 8;


function master() {
	var assert = require('assert');
	var fs = require('fs');


	describe('mulit_process', function() {
		var pids = [];
		this.timeout(120*1000);

		before(function(done) {

			debug('fork master');
			var flist = [];
			var fork = require('child_process').fork;

			if (fs.existsSync(logfile)) fs.unlinkSync(logfile);

			var env = {};
			if (process.env) {
				for(var i in process.env) {
					env[i] = process.env[i];
				}
			}
			env.CLUSTER_APP_FORK_MARK = '1';


			function doFork() {
				var f = fork(__filename, [], {env: env});

				f.on('message', function(msg) {
					if (msg == 'online') {
						flist.push(f);
						pids.push(f.pid);

						debug('master: fork online');

						if (flist.length == clientnum) {
							debug('master:work');
							flist.forEach(function(item) {
								item.send('work');
							});
						}
					}
				});

				f.on('exit', function() {
					var index = flist.indexOf(f);
					if (index != -1) {
						flist.splice(index, 1);

						// 自己也退出吧
						if (!flist.length) {
							done();
						}
					} else {
						debug('master: f index -1');
					}
				});
			}

			var clientNum2 = clientnum;
			while(clientNum2--) doFork();
		});


		it('assertlogfile', function() {

			var pinfo = {};
			pids.forEach(function(pid) {pinfo[pid] = []});
			// var gTime = 0;
			assert(fs.existsSync(logfile));

			fs.readFileSync(logfile, {encoding: 'utf8'}).split('\n')
				.forEach(function(line) {
					if (!line) return;
					var arr = line.split(',');
					var times = pinfo[arr[0]];

					assert(arr.length == 3 && times, 'err line:'+line, arr.length);

					var time = Number(arr[1]);
					var index = Number(arr[2]);

					// assert(gTime < time, 'time err: '+line);
					assert(!times.length || index == times[times.length-1].index -1, 'index err: '+line);

					// gTime = time;
					times.push({t: time, index: index});
				});

			// 检查收集到的数据条数是否对
			pids.forEach(function(pid) {
				assert.equal(pinfo[pid].length, lognum, 'line num not equal pid:'+pid+' len:'+pinfo[pid].length);
			});
		});
	});
}


function fork() {
	debug('fork start');
	var log = require('../')({file: logfile, writeLength: 20, maxLength: 0});
	var logindex = lognum;

	function doLog() {
		if (logindex <= 0) return;

		var splitKey = Math.random()*1000;
		while(logindex-- % splitKey > 0) {
			var date = new Date();
			log('\n'+process.pid+','+(date.getTime()*100000+date.getMilliseconds())+','+logindex);
		}

		if (logindex <= 0) {
			debug(process.pid+' log end');
		} else {
			setTimeout(doLog, 5);
		}
	}

	log.instance.on('flushEnd', function() {
		setTimeout(doLog, 2);

		if (!log.instance.waitQuery.length && logindex <= 0) {
			process.exit();
		}
	});

	process.on('message', function(msg) {
		if (msg == 'work') {
			doLog();
		}
	});

	process.send('online');
}


// start
if (process.env.CLUSTER_APP_FORK_MARK) {
	fork();
} else {
	master();
}
