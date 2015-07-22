node-qpd
==================

Get process swap usage in Linux.

## Install

```
npm i qpd --save
```

## Usage

```javascript
var qpd = require('qpd')({file:'/var/log/w.log'});
qpd('msg1');
qpd('msg2');
```
