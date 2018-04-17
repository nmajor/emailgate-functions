import config from '../../config';
import * as pdfHelper from '../../lib/pdfHelper';
import mongoConnect from '../../lib/mongoConnect';

function getEmail(emailId) {
  return new Promise((resolve, reject) => {
    mongoConnect((db) => {
      const collection = db.collection('emails');
      collection.findOne({ _id: emailId }, (err, doc) => { // eslint-disable-line consistent-return
        if (err) { return reject(err); }
        if (!doc) { return reject(new Error('No document found.')); }

        resolve(doc);
      });
    });
  });
}

function buildPdf(email) {
  console.log(`Building email ${email} pdf`);
  const html = email.template.replace('[[BODY]]', email.body);
  return pdfHelper.buildPdf(html, 'email', email, config.emailOptions);
}

function uploadPdf(email, pdfObj) {
  console.log(`Uploading email ${email._id} pdf`);
  return pdfHelper.uploadPdfObject(pdfObj, console.log);
}

function savePdfResults(email, pdfResults) {
  return new Promise((resolve, reject) => {
    mongoConnect((db) => {
      const collection = db.collection('emails');
      collection.update(
      { _id: email._id },
      { $set: { pdf: pdfResults } },
      (err, result) => { // eslint-disable-line consistent-return
        if (err) { return reject(err); }
        if (result.result.n !== 1) { return reject(new Error('No document updated.')); }

        resolve();
      });
    });
  });
}

export default function emailPdf(event, context, callback) {
  // const emailId = 'HkGba-mwf-';
  const emailId = event.pathParameters.id;

  return getEmail(emailId)
  .then(email => {
    return buildPdf(email)
    .then(pdfObj => uploadPdf(email, pdfObj))
    .then(pdfResults => savePdfResults(email, pdfResults))
    .then(() => getEmail(emailId));
  })
  .then(email => {
    callback(null, {
      statusCode: 200,
      headers: {
        'Content-Type' : 'application/json',
        'Access-Control-Allow-Origin' : '*',
      },
      body: JSON.stringify(email),
    });
  })
}
