var logfile = __dirname+'/tmp2.log';
var log = require('../')({file: logfile, flag: 'w+'});

log('some msg');
log.abq.on('open', function() {
	process.exit();
});
