// Build-time tool only: supply the path to an existing sharp installation.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require(process.argv[2]);
(async()=>{
 const dir=path.join(__dirname,'WorldSync.Desktop/Assets/Brand');
 const svg=fs.readFileSync(path.join(dir,'worldsync-icon-app.svg'));
 await sharp(svg,{density:576}).resize(1024,1024).png().toFile(path.join(dir,'worldsync-icon-master.png'));
 const sizes=[16,20,24,32,40,48,64,128,256],frames=[];
 for(const size of sizes)frames.push(await sharp(svg,{density:576}).resize(size,size).png().toBuffer());
 const header=Buffer.alloc(6+16*sizes.length);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);
 let offset=header.length;
 sizes.forEach((size,i)=>{let at=6+16*i;header[at]=header[at+1]=size===256?0:size;header.writeUInt16LE(1,at+4);header.writeUInt16LE(32,at+6);header.writeUInt32LE(frames[i].length,at+8);header.writeUInt32LE(offset,at+12);offset+=frames[i].length;});
 fs.writeFileSync(path.join(dir,'app.ico'),Buffer.concat([header,...frames]));
 console.log('Generated transparent 1024px master and nine-frame ICO');
})();
