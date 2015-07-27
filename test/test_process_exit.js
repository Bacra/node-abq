var cDebug = require('debug');
var debug = cDebug('abq:test');
// cDebug.enable('abq');
// cDebug.enable('abq:test');

function getlogfile(type) {
	return __dirname+'/tmp_proc_exit_'+type+'.log';
}

function whileLogfile(type, num, callback) {
	while(num--) {
		var logfile = getlogfile(type+'-'+num);
		callback(logfile, num);
	}
}

function master(type, lognum, logfiles) {
	var fs = require('fs');
	var assert = require('assert');
	lognum || (lognum = 1);
	logfiles || (logfiles = 1);

	describe('process_exit-'+type, function() {

		before(function(done) {
			this.timeout(60*1000);

			var fork = require('child_process').fork;
			var env = {};
			if (process.env) {
				for(var i in process.env) {
					env[i] = process.env[i];
				}
			}

			env.CLUSTER_APP_FORK_MARK	= 1;
			env.CLUSTER_APP_LOGTYPE		= type;
			env.CLUSTER_APP_LOGNUM		= lognum;
			env.CLUSTER_APP_LOGFILES	= logfiles;

			whileLogfile(type, logfiles, function(logfile) {
				if (fs.existsSync(logfile)) fs.unlinkSync(logfile);
			});

			fork(__filename, [], {env: env})
				.once('exit', function() {
					debug('write done');
					done();
				});
		});

		whileLogfile(type, logfiles, function(logfile, index) {
			it('assertlogfile-'+type+'-'+index, function() {
				assert(fs.existsSync(logfile), 'file not exists');
				var cont = fs.readFileSync(logfile, {encoding: 'utf8'});
				assert.ok(!!cont, 'file has no content');
				assert.equal(cont, new Array(lognum+1).join(type+'\n'));
			});
		});
	});
}


function fork() {
	var type = process.env.CLUSTER_APP_LOGTYPE;
	var lognum = Number(process.env.CLUSTER_APP_LOGNUM);
	var logfiles = Number(process.env.CLUSTER_APP_LOGFILES);

	var fnum = logfiles;
	whileLogfile(type, logfiles, function(logfile) {
		debug('gen file: %s', logfile);
		var log = require('../')({file: logfile, flag: 'w+'});
		var lnum = lognum;
		while(lnum--) log(type+'\n');

		log.instance.on('open', function() {
			if (--fnum <= 0) process.exit();
		});
	});
}

// process.env.UV_THREADPOOL_SIZE = 64;

// start
if (process.env.CLUSTER_APP_FORK_MARK) {
	fork();
} else {
	// 1个进程写1个文件 1条数据
	master('base1', 1);
	// 1个进程写1个文件 10条数据
	master('base2', 10);
	// 1个进程写1个文件 10000条数据
	master('base3', 10000);
	// 1个进程写20个文件 1条数据
	master('base4', 1, 20);
	// 1个进程写20个文件 10000条数据
	master('base5', 10000, 20);
}
