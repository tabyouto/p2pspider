'use strict';
let EventEmitter = require('events').EventEmitter;
let event = new EventEmitter();
let P2PSpider = require('../lib');
let redis = require("redis");
let sqlAction = require("./mysql.js"); //mysql 配置文件
let client = redis.createClient();
let readyFlag = true;
let index = 0;
//let heapdump = require('heapdump')
//heapdump.writeSnapshot()
let file_number = 1;
let result = [];
let tmpArr = [];

let p2p = P2PSpider({
	nodesMaxSize: 600,   // be careful
	maxConnections: 600, // be careful
	timeout: 5000
});

p2p.ignore(function (infohash, rinfo, callback) {
	// false => always to download the metadata even though the metadata is exists.
	let theInfohashIsExistsInDatabase = false;
	callback(theInfohashIsExistsInDatabase);
});


event.on('empty', function (v) {
	console.log('emit', v)
	if (v) {
		readyFlag = false;
		sql();
	}
});

p2p.on('metadata', function (metadata) {
	file_number = 1;
	result = [];
	tmpArr = [];
	if (metadata.info.name) {
		tmpArr.push(metadata.info.name.toString());
	} else {
		return;
	}
	tmpArr.push(metadata.magnet);
	tmpArr.push(metadata.infohash);
	if (metadata.info.files) {
		let ignoreCount = 0;
		let listFileSize = 0;
		let flag = false; //判断是不是无效文件
		let text = []; //多个文件名
		for (let i = 0; i < metadata.info.files.length; i++) {
			let path_name = metadata.info.files[i].path ? metadata.info.files[i].path.toString() : '';
			if (path_name.indexOf('_____padding_file') > -1) {
				ignoreCount++;
				flag = true;
			} else {
				listFileSize += parseInt(metadata.info.files[i].length);
			}
			if (!flag && text.length <= 20) {
				// console.log(metadata.info.files[i])
				text.push(metadata.info.files[i].path.toString());
				flag = false;
			}
		}
		//console.log('原始数量',metadata.info.files.length);
		file_number = metadata.info.files.length - ignoreCount;
		// console.log('结果',metadata.info.files.length - ignoreCount,'--------------------------------')
		// console.log('文件大小',listFileSize,'+++++++++++++++++++++++++++++++')
		tmpArr.push(listFileSize);
	} else {
		tmpArr.push(metadata.info.length);
	}

	tmpArr.push(new Date().getTime());
	tmpArr.push(0);
	tmpArr.push(0);
	tmpArr.push(file_number);
	if (text) {
		tmpArr.push(text.join(','));
	} else {
		tmpArr.push('');
	}
	result.push(tmpArr);

	client.rpush(['p2pData', JSON.stringify(result)], function (err, reply) {
		console.log(reply); //prints 2
		if (parseInt(reply) > 5000 && readyFlag) {
			event.emit('empty', readyFlag); //通知清空
		} else {
			// console.log('没有达到5000')
		}
	});


});


function sql() {
	console.log('called');
	client.LPOP('p2pData', function (err, v) {
		console.log(v);
		if (v) {
			index++;
			sqlAction.insert('INSERT IGNORE INTO list(name,infoHash,size,catch_date,hot,download_count,file_number,content_file) VALUES ?', [JSON.parse(v)], function (err, vals, fields) {
				if (error) throw error;
				if (index != 5000) {
					sql();
				} else {
					index = 0;
					readyFlag = true; //停止取出
				}
			});
		} else {
			index = 0;
			readyFlag = true; //停止取出
		}
	});
}


p2p.listen(6881, '0.0.0.0');