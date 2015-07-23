var fs		= require('fs');
var path	= require('path');
var xtend	= require('xtend');
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
	fdWaitForClose	: 60*1000,
	maxRetry		: 2
};

function QPD(opts) {
	this.opts		= xtend({}, exports.defaults, opts);
	this.waitQuery	= [];
	this.writeQuery	= [];

	if (this.opts.maxLength && this.opts.maxLength < this.opts.writeLength) {
		this.opts.maxLength = this.opts.writeLength;
	}

	// 声明一下会用到的成员变量
	this.fd = this.file = this.oldfd = null;
	this._writing = this._fding = false;
}

QPD.prototype = {
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
			if (self.oldfd) {
				self.write();
			} else {
				var splitLen = len - opts.writeLength;
				waitQuery.splice(0, splitLen/*, '========== logfd:empty msg query <len:'+splitLen+'> =========='*/);
				debug('logfd: empty msg query %d', splitLen);
			}
		} else if (opts.file) {
			self.genfd(opts.file);
		}
	},
	write: function() {
		this.writeQuery.push(this.waitQuery);
		this.waitQuery = [];
		this.flush();
	},
	// linux 必须逐个写，否则有可能错乱
	flush: function(retry) {
		var self = this;
		var fd = self.fd || self.oldfd;
		if (self._writing || !fd || !self.writeQuery.length) return;

		self._writing = true;

		// 一次性全部数据 (性能不知道ok不)
		if (!retry && self.writeQuery.length > 1) {
			self.writeQuery = [concat.apply([], self.writeQuery)];
		}

		fs.write(fd, self.writeQuery[0].join(''), function(err) {
			self._writing = false;
			if (err) {
				retry || (retry = 0);
				debug('write err file:%s retry:%d err: %o', self.file, retry, err);
				if (retry < self.opts.maxRetry) {
					self.flush(retry+1);
					debug('retry write');
					return;
				}
			}

			// 清理写队列
			self.writeQuery.shift();
			self.flush();
		});
	},
	genfd: function(file) {
		var self = this;
		if (file == self.file || self._fding) return;

		self.oldfd = self.fd;
		// 只要有一次genfd，那么opts的file就会被清掉
		self.fd = self.opts.file = null;

		// 旧接口延迟关闭
		if (self.opts.fdWaitForClose) {
			setTimeout(self._closeOldFd.bind(self), self.opts.fdWaitForClose);
		} else {
			self._closeOldFd();
		}

		if (!self._fding) {
			self._fding = true;

			mkdirp(path.dirname(file), function(err) {
				if (err) return debug('mkdir err:%o', err);

				fs.open(file, self.opts.flag, function(err, fd) {
					if (!err) {
						self.fd = fd;
						self.file = file;
						self._closeOldFd();
						self.init_();
					}

					self._fding = false;
				});
			});
		}
	},
	_closeOldFd: function() {
		if (this.oldfd) {
			fs.close(this.oldfd, function(err) {
				debug('close fd err:%o', err);
			});

			this.oldfd = null;
		}
	}
};


function main(opts) {
	var qpd = new QPD(opts);
	return qpd.handler.bind(qpd);
}
