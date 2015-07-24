var fs		= require('fs');
var path	= require('path');
var events	= require('events');
var extend	= require('extend');
var mkdirp	= require('mkdirp');
var debug	= require('debug')('qpd');

var concat	= Array.prototype.concat;


exports = module.exports = main;
exports.defaults = {
	file			: null,
	flag			: 'a+',
	writeLength		: 100,
	// fd还没创建 日志过满的时候
	maxLength		: 10000,
	writeInterval	: 400,
	maxRetry		: 2
};

function QPD(opts) {
	this.opts		= extend({}, exports.defaults, opts);
	this.waitQuery	= [];
	this.writeQuery	= [];

	if (this.opts.maxLength && this.opts.maxLength < this.opts.writeLength) {
		this.opts.maxLength = this.opts.writeLength;
	}

	// 声明一下会用到的成员变量
	this.fd = null;
	this._writing = false;
	this._genfd = new GenFd();

	events.EventEmitter.call(this);
}

require('util').inherits(QPD, events.EventEmitter);

extend(QPD.prototype, {
	init_: function() {
		if (this._inited) return;
		this._inited = true;

		if (this.opts.writeInterval) {
			// 定期日志写入文件
			setInterval(this.write.bind(this), this.opts.writeInterval);
		}
	},
	handler: function(msg) {
		var self		= this;
		var waitQuery	= self.waitQuery;
		var len			= waitQuery.length;
		var opts		= self.opts;

		waitQuery.push(msg);

		if (self.fd) {
			if (len > opts.writeLength) {
				self.write();
			}
		} else if (opts.maxLength && len > opts.maxLength) {
			var splitLen = len - opts.writeLength;
			waitQuery.splice(0, splitLen);
			debug('logfd: empty msg query %d', splitLen);
			self.emit('empty', splitLen);
		} else if (opts.file) {
			self.genfd(opts.file);
		}
	},
	write: function() {
		this.toWriteQuery();
		this.flush();
	},
	writeSync: function() {
		this.toWriteQuery();
		this.flushSync();
	},
	flush: function() {
		this._doFlush(false);
	},
	flushSync: function() {
		this._doFlush(true);
	},
	toWriteQuery: function() {
		this.writeQuery.push(this.waitQuery);
		this.waitQuery = [];
	},
	_doFlush: function(isSync) {
		if (this._writing || !this.fd || !this.writeQuery.length) return;

		this._writing = true;

		// 一次性全部数据 (性能不知道ok不)
		if (this.writeQuery.length > 1) {
			this.writeQuery = [concat.apply([], this.writeQuery)];
		}

		this[isSync ? '_flushSync' : '_flush'](new Buffer(this.writeQuery[0].join('')), 0, 0);
	},
	_flush: function(buffer, offset, retry) {
		var self = this;

		fs.write(this.fd, buffer, offset, buffer.length-offset, null, function(err, written, buffer) {
			self._flushcb(err, buffer, written, retry, false);
		});
	},
	_flushSync: function(buffer, offset, retry) {
		var written;
		var err;
		try {
			written = fs.writeSync(this.fd, buffer, offset, buffer.length-offset, null);
		} catch(e) {
			err = e;
		}

		this._flushcb(err, buffer, written || 0, retry, true);
	},
	// linux 必须逐个写，否则顺序有可能错乱
	// 同时也为了方便增加retry
	_flushcb: function(err, buffer, written, retry, isSync) {
		if (err) {
			debug('write err retry:%d err: %o', retry, err);
			if (retry < this.opts.maxRetry) {
				this[isSync ? '_flushSync' : '_flush'](buffer, written, ++retry);
				this.emit('retry', err, retry);
				debug('retry write');
				return;
			}
		}

		// 清理写队列
		this.writeQuery.shift();
		this._writing = false;

		if (this.writeQuery.length) {
			this._doFlush(isSync);
		} else {
			this.emit('flushEnd');
		}
	},
	genfd: function(file, noAutoBind) {
		var self = this;
		// 只要有一次genfd，那么opts的file就会被清掉
		self.opts.file = null;

		if (typeof file != 'string') {
			if (noAutoBind !== true) self.fd = file;
			self.emit('open', null, file, noAutoBind);
			return;
		}

		this._genfd.generate(file, self.opts.flag, function(err, fd) {
			if (!err && noAutoBind !== true) self.bindfd(fd); 
			self.emit('open', err, fd, noAutoBind, file);
		});
	},
	bindfd: function(fd) {
		this.fd = fd;
		this.init_();
	}
});


function GenFd() {
	this._fding = false;
	this.fd = this.file = null;
}

GenFd.prototype = {
	generate: function(file, flag, callback) {
		var self = this;

		if (self._fding) {
			return callback(new Error('opening'));
		} else if (file == self.file) {
			return callback(null, self.fd);
		}

		self._fding = true;
		self.file = file;

		mkdirp(path.dirname(file), function(err) {
			if (err) {
				callback(err);
				debug('mkdir err:%o', err);
				return;
			}

			fs.open(file, flag, function(err, fd) {
				self._fding = false;
				if (!err) self.fd = fd;
				callback(err, fd);
			});
		});
	}
};



// 内存管理。。忧伤
var qpds = [];
function main(opts) {
	var qpd = new QPD(opts);
	var handler = qpd.handler.bind(qpd);
	handler.qpd = qpd;
	qpds.push(qpd);

	bindProcess();
	return handler;
}

function bindProcess() {
	if (bindProcess._inited) return;
	bindProcess._inited = true;

	process.on('exit', function() {
		qpds.forEach(function(qpd) {

			// 将所有数据移动到write 队列
			qpd.toWriteQuery();
			var isWriteLog = true;
			qpd.emit('processExit', qpd._writing, function() {isWriteLog = false});

			if (qpd._writing) {
				qpd._writing = false;

				if (isWriteLog) {
					qpd.writeQuery.unshift('\n\n↓↓↓↓↓↓↓↓↓↓ [qpd] process exit write, maybe repeat!!!~ ↓↓↓↓↓↓↓↓↓↓\n\n');
					qpd.writeQuery.push('\n\n↑↑↑↑↑↑↑↑↑↑ [qpd] process exit write, maybe repeat!!!~ ↑↑↑↑↑↑↑↑↑↑\n\n');
				}
			}

			// 直接同步写
			qpd.flushSync();
		});
	});
}
