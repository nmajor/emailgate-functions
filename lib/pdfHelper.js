import pdf from 'html-pdf';
import pdfjs from 'pdfjs-dist';
import BufferStream from './BufferStream';
import shortid from 'shortid';
import https from 'https';
import fs from 'fs';
import crypto from 'crypto';
import path from 'path'

import config from '../config';

export function getPdfPages(buffer) {
  return new Promise((resolve) => {
    pdfjs.getDocument(buffer).then((doc) => {
      const pageCount = doc.numPages;

      resolve(pageCount);
    });
  });
}

export function buildPdf(html, model, obj, options) {
  return new Promise((resolve, reject) => {
    return pdf.create(html, {
      ...options,
      phantomPath: path.resolve(process.env.LAMBDA_TASK_ROOT, 'bin/phantomjs'),
    }).toBuffer((err, buffer) => { // eslint-disable-line consistent-return
      if (err) { return reject(err); }

      getPdfPages(buffer)
			.then((pageCount) => {
        resolve({ // eslint-disable-line indent
          model,
          _id: obj._id,
          _compilation: obj._compilation,
          modelVersion: obj.updatedAt,
          pageCount,
          buffer,
        });
			});
    });
  });
}

export function pdfFilename(pdfObj) {
  return `${pdfObj.model}-${pdfObj._id}.pdf`;
}

export function pdfPath(pdfObj) {
  const compilationId = pdfObj.model === 'compilation' ? pdfObj._id : pdfObj._compilation;
  const filename = pdfFilename(pdfObj);
  return `compilations/${compilationId}/${filename}`;
}

export function savePdfObject(pdfObj) {
  return new Promise((resolve, reject) => {
    const dir = '/tmp/compilation';
    pdfObj.filename = pdfObj.filename || pdfFilename(pdfObj); // eslint-disable-line no-param-reassign

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir);
    }

    const localPath = `${dir}/${pdfObj.filename}`;
    fs.writeFile(localPath, pdfObj.buffer, (err) => {
      if (err) { return reject(err); }

      return resolve(localPath);
    });
  });
}

export function uploadPdfObject(pdfObj, log) {
  log = log || function() {}; // eslint-disable-line

  return new Promise((resolve, reject) => {
    const filename = pdfFilename(pdfObj);
    const path = pdfPath(pdfObj);
    const fullPath = `${process.env.MANTA_APP_PUBLIC_PATH}/${path}`;

    const client = config.mantaClient;
    const pdfStream = new BufferStream(pdfObj.buffer);
    const options = {
      mkdirs: true,
      headers: {
        'Access-Control-Allow-Headers': 'Range',
        'Access-Control-Expose-Headers': 'Accept-Ranges, Content-Encoding, Content-Length, Content-Range',
        'Access-Control-Allow-Origin': '*',
      },
    };

    client.put(fullPath, pdfStream, options, (err) => { // eslint-disable-line consistent-return
      if (err) { return reject(err); }

      const updatedAt = new Date();
      const uploadedAt = Date.now();

      client.info(fullPath, (err, results) => { // eslint-disable-line
        if (err) { return reject({ message: err.message, err, fullPath }); }

        const fileUrl = `${process.env.MANTA_APP_URL}/${fullPath}?${uploadedAt}`;

        resolve({
          model: pdfObj.model,
          _id: pdfObj._id,
          modelVersion: pdfObj.modelVersion,
          filename,
          pageCount: pdfObj.pageCount,
          url: fileUrl,
          updatedAt,
          uploadedAt,
          path: fullPath,
          extension: results.extension,
          lastModified: results.headers['last-modified'],
          type: results.type,
          etag: results.etag,
          md5: results.md5,
          size: results.size,
          fileResults: results,
        });
      });
    });
  });
}

export function addGutterMargins(pdfObj, log) {
  // pdfObj.localPath
  // pdfjam --twoside myfile.pdf --offset '1cm 0cm' --suffix 'offset'
  return new Promise((resolve, reject) => {
    const suffix = 'guttered';
    const outputFile = pdfObj.localPath.replace('.pdf', `-${suffix}.pdf`);
    const spawn = require('child_process').spawn; // eslint-disable-line global-require

    const pdfjam = spawn('pdfjam', [
      '--twoside',
      `--papersize '{${config.width},${config.height}}'`,
      pdfObj.localPath,
      '--offset',
      `\'${config.gutterMarginOffset} 0mm\'`,
      '--outfile',
      outputFile,
    ]);

    log([
      '--twoside',
      `--papersize '{${config.width},${config.height}}'`,
      pdfObj.localPath,
      '--offset',
      `\'${config.gutterMarginOffset} 0mm\'`,
      '--outfile',
      outputFile,
    ].join(' '));

    pdfjam.on('close', (code) => {
      if (code === 0) {
        pdfObj.localPath = outputFile; // eslint-disable-line no-param-reassign
        pdfObj.buffer = fs.readFileSync(pdfObj.localPath); // eslint-disable-line no-param-reassign
        resolve(pdfObj);
      } else {
        reject('pdfjam returned a bad exit code.');
      }
    });
  });
}

export function downloadPdf(pdfObj) {
  return new Promise((resolve, reject) => { // eslint-disable-line consistent-return
    if (!pdfObj || !pdfObj.url) { return reject(new Error('Missing pdfObj or pdfObj.url')); }

    const dir = '/tmp/compilation';

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir);
    }

    const localPath = `${dir}/${pdfObj.filename}`;

    // crypto.createHash('md5').update(data).digest("hex");

    if (fs.existsSync(localPath)) {
      const fileMd5 = crypto.createHash('md5');
      fileMd5.write(fs.readFileSync(localPath));
      fileMd5.end();
      if (fileMd5.read().toString('base64') === pdfObj.md5) {
        return resolve(localPath);
      }
    }

    // const md5 = crypto.createHash('md5');
    const file = fs.createWriteStream(localPath);
    https.get(pdfObj.url, (stream) => {
      stream.pipe(file);
      // stream.pipe(md5);

      stream.on('end', () => {
        // md5.end();
        resolve(localPath);
      });

      stream.on('error', (err) => {
        reject(err);
      });
    });
  });
}

export function appendBlankPage(pdfObj) {
  const appendBlankPageLatexPath = '/var/app/latex/appendBlankPage.tex';

  return savePdfObject(pdfObj)
  .then((localPath) => { // eslint-disable-line no-shadow
    return new Promise((resolve, reject) => {
      const appendBlankPageLatex = fs.readFileSync(appendBlankPageLatexPath, 'utf8').replace('\\\\', '\\');

      const oldPath = localPath;
      const pathPieces = localPath.split('/');
      const oldFileName = pathPieces.pop();
      const newFileName = oldFileName.replace(/\.pdf$/, '-blanked.pdf');
      const oldDir = pathPieces.join('/');
      const newDir = oldDir;
      const latex = appendBlankPageLatex
      .replace('PDF_PATH', oldPath)
      .replace('PDF_HEIGHT', config.height)
      .replace('PDF_WIDTH', config.width);

      const command = `echo "${latex.replace('\\', '\\\\')}" | pdflatex -jobname="${newFileName}" -output-directory="${newDir}"`;
      const spawn = require('child_process').spawn; // eslint-disable-line global-require
      const pdflatex = spawn('/bin/bash', [
        '-c',
        command,
      ]);

      pdflatex.on('close', (code) => {
        if (code === 0) {
          const newPath = [newDir, newFileName].join('/');
          pdfObj.buffer = fs.readFileSync(`${newPath}.pdf`); // eslint-disable-line no-param-reassign
          getPdfPages(pdfObj.buffer)
          .then((pageCount) => {
            pdfObj.pageCount = pageCount; // eslint-disable-line no-param-reassign
            fs.unlinkSync(`${newPath}.pdf`);
            fs.unlinkSync(`${newPath}.aux`);
            fs.unlinkSync(`${newPath}.log`);
            resolve(pdfObj);
          });
        } else {
          reject('pdflatex returned a bad exit code.');
        }
      });
    });
  });
}

export function concatToFile(fileArguments) {
  return new Promise((resolve, reject) => {
    const newFilename = `/tmp/compilation/part-${shortid.generate()}.pdf`;

    const spawn = require('child_process').spawn; // eslint-disable-line global-require
    const pdftk = spawn('pdftk', [
      ...fileArguments,
      'cat',
      'output',
      newFilename,
    ]);

    pdftk.on('close', (code) => {
      resolve(newFilename);
    });

    pdftk.on('error', (err) => {
      reject(err.message);
    });
  });
}

export function concatToBuffer(fileArguments) {
  return new Promise((resolve, reject) => {
    const spawn = require('child_process').spawn; // eslint-disable-line global-require

    const pdftk = spawn('pdftk', [
      ...fileArguments,
      'cat',
      'output',
      '-',
    ]);

    const pdfBuffers = [];
    pdftk.stdout.on('data', (chunk) => {
      pdfBuffers.push(chunk);
    });
    pdftk.stdout.on('end', () => {
      resolve(Buffer.concat(pdfBuffers));
    });

    const pdfErrBuffers = [];
    pdftk.stderr.on('data', (chunk) => {
      pdfErrBuffers.push(chunk);
    });
    pdftk.stderr.on('end', () => {
      reject(Buffer.concat(pdfErrBuffers).toString('utf8'));
    });
  });
}
