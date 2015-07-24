require('debug').enable('qpd');

var fork = require('child_process').fork;

console.log('========== mulit_process ==========\n\n');
fork(__dirname+'/mulit_process').on('exit', function(code, signal) {
	if (code) {
		process.exit(code);
	} else {

		console.log('\n\n========== process_exit ==========\n\n');
		var logfile = __dirname+'/tmp2.log';
		var fs = require('fs');
		if (fs.existsSync(logfile)) fs.unlinkSync(logfile);
		fork(__dirname+'/process_exit').on('exit', function() {
			if (fs.existsSync(logfile)) {
				require('assert').equal(fs.readFileSync(logfile, {encoding: 'utf8'}), 'some msg');
			}

			process.exit();
		});
	}
});
