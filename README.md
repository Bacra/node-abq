node-adq  [![Build Status](https://travis-ci.org/Bacra/node-adq.svg?branch=master)](https://travis-ci.org/Bacra/node-adq)
==================

A(ppend) D(ata) (in) Q(uery)

Append data to a file in query.

## Install

```
npm i adq --save
```

## Usage

```javascript
var adq = require('adq')({file:'/var/log/w.log'});
adq('msg1');
adq('msg2');
```
