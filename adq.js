var fs		= require('fs');
var path	= require('path');
var events	= require('events');
var extend	= require('extend');
var mkdirp	= require('mkdirp');
var debug	= require('debug')('adq');

var concat	= Array.prototype.concat;


exports = module.exports = main;
exports.QPD = QPD;
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
	this._writing = this._destroyed = false;
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

		bindProcess();
	},
	/**
	 * 写数据的入口
	 * @param  {String} msg
	 */
	handler: function(msg) {
		if (this._destroyed) return debug('no msg: has destroyed');

		var self		= this;
		var waitQuery	= self.waitQuery;
		var len			= waitQuery.length;
		var opts		= self.opts;

		waitQuery.push(Buffer.isBuffer(msg) ? msg : new Buffer(typeof msg == 'string' ? msg : ''+msg));

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
	bindfd: function(fd, noAutoClose) {
		// 自动关闭之前的fd
		if (this.fd && noAutoClose !== true) fs.close(this.fd);

		this.fd = fd;
		this.init_();
	},
	destroy: function() {
		if (this._destroyed) return debug('destroy again');
		this._destroyed = true;

		if (!this.fd) return;

		// 将所有数据移动到write 队列
		this.toWriteQuery();
		var isWriteLog = true;
		this.emit('processExit', this._writing, function() {isWriteLog = false});

		if (this._writing) {
			this._writing = false;

			if (isWriteLog) {
				this.writeQuery.unshift(new Buffer('\n\n↓↓↓↓↓↓↓↓↓↓ [adq] process exit write, maybe repeat!!!~ ↓↓↓↓↓↓↓↓↓↓\n\n'));
				this.writeQuery.push(new Buffer('\n\n↑↑↑↑↑↑↑↑↑↑ [adq] process exit write, maybe repeat!!!~ ↑↑↑↑↑↑↑↑↑↑\n\n'));
			}
		}

		// 直接同步写
		this.flushSync();
		try {
			fs.closeSync(this.fd);
		} catch(e) {}
		this.fd = null;

		this.emit('destroy');
		this.removeAllListeners();
	},

	_doFlush: function(isSync) {
		if (this._writing || !this.fd || !this.writeQuery.length) return;
		this._writing = true;

		// 一次性全部数据 (性能不知道ok不)
		this[isSync ? '_flushSync' : '_flush'](Buffer.concat(this.writeQuery.length > 1 ? concat.apply([], this.writeQuery) : this.writeQuery[0]), 0, 0);
		this.writeQuery = [];
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



var adqs = [];
function main(opts) {
	var adq = new QPD(opts);
	var handler = adq.handler.bind(adq);
	handler.adq = adq;
	adqs.push(adq);

	// 销毁的时候从队列中移除
	adq.once('destroy', function() {
		var index = adqs.indexOf(adq);
		if (index != -1) {
			adqs.splice(adqs.indexOf(adq), 1);
			debug('remove adqs %d', index);
		} else {
			debug('remove adqs err:-1');
		}
	});

	return handler;
}

function bindProcess() {
	if (bindProcess._inited) return;
	bindProcess._inited = true;

	process.on('exit', function() {
		adqs.forEach(function(adq) {
			adq.destroy();
		});
	});
}