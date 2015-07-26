var logfile = __dirname+'/tmp2.log';

function master() {
	var fs = require('fs');
	var assert = require('assert');

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
			env.CLUSTER_APP_FORK_MARK = '1';

			if (fs.existsSync(logfile)) fs.unlinkSync(logfile);

			fork(__filename, [], {env: env})
				.once('exit', function() {
					console.log('write done');
					done();
				});
		});

		it('assertlogfile', function() {
			assert(fs.existsSync(logfile));		
			assert.equal(fs.readFileSync(logfile, {encoding: 'utf8'}), 'some msg');
		});
	});
}


function fork() {
	var log = require('../')({file: logfile, flag: 'w+'});
	log('some msg');

	log.instance.on('open', function() {
		process.exit();
	});
}

// start
if (process.env && process.env.CLUSTER_APP_FORK_MARK) {
	fork();
} else {
	master();
}
