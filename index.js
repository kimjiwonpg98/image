"use strict";

const querystring = require("querystring"); // Don't install.
const AWS = require("aws-sdk"); // Don't install.
const Sharp = require("sharp");
const convert = require("heic-convert");

const allowedExtension = [
  "jpg",
  "jpeg",
  "png",
  "webp",
  "heic",
  "HEIC",
  "JPG",
  "JPEG",
  "PNG",
];

const MAX_WIDTH = 1280;
const MAX_HEIGHT = 720;

const S3 = new AWS.S3({
  region: "ap-northeast-2",
});
const BUCKET = "u-market";

exports.handler = (event, context, callback) => {
  const { request, response } = event.Records[0].cf;
  // Parameters are w, h, f, q and indicate width, height, format and quality.
  const params = querystring.parse(request.querystring);

  // Required width or height value.
  if (!params.w && !params.h) {
    return callback(null, response);
  }

  // Extract name and format.
  const { uri } = request;
  const [, imageName, extension] = uri.match(/\/?(.*)\.(.*)/);

  // Init variables
  let width;
  let height;
  let format;
  let quality; // Sharp는 이미지 포맷에 따라서 품질(quality)의 기본값이 다릅니다.
  let resizedImage;

  // Init sizes.
  width = parseInt(params.w, 10) ? parseInt(params.w, 10) : MAX_WIDTH;
  height = parseInt(params.h, 10) ? parseInt(params.h, 10) : MAX_HEIGHT;

  // Init quality.
  if (parseInt(params.q, 10)) {
    quality = parseInt(params.q, 10);
  }

  // Init format.
  format = params.f ? params.f : extension;
  format = format === "jpg" ? "jpeg" : format;
  format = format === "HEIC" ? "jpeg" : format;

  if (!allowedExtension.includes(extension)) {
    response.status = "500";
    response.headers["content-type"] = [
      { key: "Content-Type", value: "text/plain" },
    ];
    response.body = `${extension} is not allowed`;
    callback(null, response);
    return;
  }

  // For AWS CloudWatch.
  console.log(`parmas: ${JSON.stringify(params)}`); // Cannot convert object to primitive value.
  console.log(`name: ${imageName}.${extension}`); // Favicon error, if name is `favicon.ico`.

  S3.getObject({
    Bucket: BUCKET,
    Key: decodeURI(imageName + "." + extension),
  })
    .promise()
    .then((data) => {
      if (extension === "HEIC" || extension === "heic") {
        return convert({
          buffer: data.Body,
          format: "JPEG",
          quality: 1,
        });
      } else {
        return data.Body;
      }
    })
    .then((input) => {
      resizedImage = Sharp(input);
      resizedImage
        .metadata()
        .then((meta) => {
          return resizedImage
            .resize(width, height, { fit: "inside" })
            .toFormat(format, {
              quality,
            })
            .toBuffer();
        })
        .then((buffer) => {
          // response에 리사이징 한 이미지를 담아서 반환합니다.
          response.status = 200;
          response.body = buffer.toString("base64");
          response.bodyEncoding = "base64";
          response.headers["content-type"] = [
            { key: "Content-Type", value: `image/${format}` },
          ];
          callback(null, response);
        });
    })
    .catch((error) => {
      response.status = "404";
      response.headers["content-type"] = [
        { key: "Content-Type", value: "text/plain" },
      ];
      response.body = `${request.uri} is not found. and ${error}`;
      callback(null, response);
    });
};
