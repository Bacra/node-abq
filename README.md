node-abq  [![Build Status](https://travis-ci.org/Bacra/node-abq.svg?branch=master)](https://travis-ci.org/Bacra/node-abq)
==================

A(ppend) B(uffer) (in) Q(uery)

Append data to a file in query.

## Install

```
npm i abq --save
```

## Usage

```javascript
var abq = require('abq')({file:'/var/log/w.log'});
abq('msg1');
abq(new Buffer('msg2'));
```
