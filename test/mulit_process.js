var logfile		= __dirname+'/tmp.log';
var lognum		= 100000;
var clientnum	= 8;
var assert		= require('assert');


function master() {
	console.log('fork master');
	var fork = require('child_process').fork;
	var fs = require('fs');

	if (fs.existsSync(logfile)) fs.unlinkSync(logfile);

	var env = {};
	if (process.env) {
		for(var i in process.env) {
			env[i] = process.env[i];
		}
	}
	env.CLUSTER_APP_FORK_MARK = '1';

	var flist = [];
	var pids = [];
	var startTime;

	function doFork() {
		var f = fork(__filename, [], {env: env});

		f.on('message', function(msg) {
			if (msg == 'online') {
				flist.push(f);
				pids.push(f.pid);

				console.log('master: fork online');

				if (flist.length == clientnum) {
					console.log('master:work');
					flist.forEach(function(item) {
						item.send('work');
					});
					startTime = Date.now();
				}
			} else if (msg == 'end') {
				f.kill('SIGTERM');
				var index = flist.indexOf(f);
				if (index != -1) {
					flist.splice(index, 1);

					// 自己也退出吧
					if (!flist.length) {
						console.log('use time:'+(Date.now() - startTime));
						assertlog();
						process.exit();
					}
				} else {
					console.warn('master: f index -1');
				}

			}
		});
	}

	function assertlog() {
		console.log('\n=========== assertlog ===========\n');

		var pinfo = {};
		pids.forEach(function(pid) {pinfo[pid] = []});
		// var gTime = 0;

		fs.readFileSync(logfile, {encoding: 'utf8'}).split('\n').forEach(function(line) {
			var arr = line.split(',');
			var times = pinfo[arr[0]];
			if (arr.length != 3 || !times) {
				console.log('err line:'+line, arr.length);
				return;
			}

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
	}

	process.on('exit', function() {
		flist.forEach(function(item) {
			item.exit && item.exit(-9);
		});
		flist = [];
	});

	var clientNum2 = clientnum;
	while(clientNum2--) doFork();
}


function fork() {
	console.log('fork start');
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
			console.log(process.pid+' log end');
		} else {
			setTimeout(doLog, 5);
		}
	}

	log.abq.on('flushEnd', function() {
		setTimeout(doLog, 2);

		if (!log.abq.waitQuery.length && logindex <= 0) {
			process.send('end');
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
console.log('start: ', process.env && process.env.CLUSTER_APP_FORK_MARK);
if (process.env && process.env.CLUSTER_APP_FORK_MARK) {
	fork();
} else {
	master();
}
