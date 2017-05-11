import * as utils from "./utils.js";

let chunkSize = 1024 * 16;
let targetBuffer = new Uint8Array(chunkSize);

export default (prims) => {
  return {
    malloc: (data, json, bin) => {
      let ptr = prims.malloc(data.length)
      return json({
        address: ptr,
        length: data.length
      });
    },
    free: (data, json, bin) => {
      prims.free(data.address);
      return json({
        address: data.address
      });
    },
    read: (data, json, bin) => {
      return bin(data.length).then((stream) => {
        let addr = data.address;
        let bytes = 0;
        while(bytes < data.length) {
          let toRead = Math.min(chunkSize, data.length-bytes);
          prims.mempeek(addr, toRead, (ab) => {
            stream.submit(ab);
          });          
          addr = utils.add64(addr, toRead);
          bytes+= toRead;
        }
        stream.close();
      });
    },
    write: (data, json, bin) => {
      let buffer = new Uint8Array(atob(data.payload).split("").map(function(c) {
        return c.charCodeAt(0);
      }));
      prims.write(data.address, buffer);
      return json({
        address: data.address,
        length: data.length
      });
    },
    dumpAllMemory: (data, json, bin) => {
      utils.log("initialized memory dumper");
      return bin(-1).then((stream) => {
        utils.log("opened stream");
        let end = [0, 0];
	let begin = [0, 0];
        let c = 0;
        while(true) {
          let meminfo = prims.queryMem(begin, true);
          end = utils.add2(meminfo[0], meminfo[1]);
          if(end[1] < begin[1]) {
            break;
          }
          if((meminfo[3][0] & 1) > 0) { // if we have R permission
            let totalSize = meminfo[1][0];
            stream.submit({
              type: "newPage",
              begin: meminfo[0],
              end,
              size: totalSize,
              memState: meminfo[2][0],
              memPerms: meminfo[3][0],
              pageInfo: meminfo[4][0]
            });
            let maxSize = 0x800000; // 0x800000
            for(let i = 0; i < totalSize; i+= maxSize) {
              let size = totalSize - i;
              size = size > maxSize ? maxSize : size;

              prims.mempeek(utils.add2(meminfo[0], i), size, (ab) => {
                stream.submit({type: "pageData"}, ab);
              });
            }            
          }
          begin = end;
        }
        stream.close();
        prims.invokeGC();
      });
    },
    invokeGC: (data, json, bin) => {
      prims.invokeGC();
      return json({
      });
    },
    get: (data, json, bin) => {
      utils.log("get " + JSON.stringify(data));
      return json((() => {
        switch(data.field) {
        case "baseAddr": return {value: prims.base};
        case "mainAddr": return {value: prims.mainaddr};
        case "sp": return {value: prims.getSP()};
        case "tls": return {value: prims.getTLS()};
        }
        utils.log("unknown field");
        return {};
      })());
    },
    invokeBridge: (data, json, bin) => {
      return json({
        returnValue: prims.call(data.funcPtr, data.intArgs, data.floatArgs)
      });
    },
    eval: (data, json, bin) => {
      return json({
        returnValue: eval.call(window, data.code).toString()
      });
    },
    ping: (data, json, bin) => {
      return json({
        originTime: json.time
      });
    }
  };
};
