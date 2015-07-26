function getlogfile(type) {
	return __dirname+'/tmp_proc_exit_'+type+'.log';
}

function master(type, lognum) {
	var fs = require('fs');
	var assert = require('assert');
	var logfile = getlogfile(type);

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

		it('assertlogfile-'+type, function() {
			assert(fs.existsSync(logfile));
			var cont = fs.readFileSync(logfile, {encoding: 'utf8'});
			assert.ok(!!cont)
			assert.equal(cont, new Array(lognum+1).join(type+'\n'));
		});
	});
}


function fork(type, lognum) {
	var logfile = getlogfile(type);
	var log = require('../')({file: logfile, flag: 'w+'});
	while(lognum--) {
		log(type+'\n');
	}

	log.instance.on('open', function() {
		process.exit();
	});
}

// start
var isMaster = !process.env || !process.env.CLUSTER_APP_FORK_MARK;

function assertlog(type, lognum) {
	isMaster ? master.apply(null, arguments) : fork.apply(null, arguments);
}

assertlog('base1', 1);
// assertlog('base2', 2);

