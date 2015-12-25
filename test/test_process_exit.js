var debug = require('debug')('abq:test');
var assert = require('assert');

var logfile = __dirname+'/tmp/proc_exit.log';

function master() {
	var fs = require('fs');

	describe('process_exit', function() {

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
			if (fs.existsSync(logfile)) fs.unlinkSync(logfile);

			fork(__filename, [], {env: env})
				.once('exit', function() {
					debug('write done');
					done();
				});
		});

		it('assertlogfile', function() {
			assert(fs.existsSync(logfile), 'file not exists');
			var cont = fs.readFileSync(logfile).toString();
			assert.ok(!!cont, 'file has no content');
			assert.equal(cont, 'before exit log\nbefore exit log\nuncaughtException log\n');
		});
	});
}


function fork() {

	var log = require('../')({file: logfile, flag: 'w+'});

	var flushed = false;
	log('before exit log\n');
	log.instance.on('flush', function() {
			var abq = this;
			if (flushed) return;
			flushed = true;

			throw -1;
		})
		.on('beforeDestroy', function(noWriteExit) {
			// assert(this.isWriting());
			noWriteExit();
		});

	// important
	process.on('uncaughtException', function()
	{
		log('uncaughtException log\n');
		process.exit();
	});
}

// process.env.UV_THREADPOOL_SIZE = 64;

// start
if (process.env.CLUSTER_APP_FORK_MARK) {
	fork();
} else {
	master();
}
