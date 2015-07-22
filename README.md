node-qpd
==================

Get process swap usage in Linux.

## Install

```
npm i qpd --save
```

## Usage

```javascript
var qpd = require('qpd')({logfile:'/var/log/w.log'});
qpd('msg1');
qpd('msg2');
```
