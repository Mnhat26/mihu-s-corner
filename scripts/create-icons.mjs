import sharp from 'sharp';
const icon=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="120" fill="#fff3c4"/><circle cx="256" cy="256" r="166" fill="#f4c64e"/><path d="M166 345V168h39l51 84 51-84h39v177h-43V248l-47 75-47-75v97z" fill="#705021"/><circle cx="377" cy="130" r="23" fill="#fff"/></svg>');
for(const size of [180,192,512])await sharp(icon).resize(size,size).png().toFile('public/icon-'+size+'.png');
console.log('Generated application icons.');
