//Author: Liang Fengbiao
//Description: This Lambda uses for ingest logs from custom source into AWS Security Lake.
// Usage:
// Ingest logs from a Nginx web server into AWS Security Lake.
// 1. Create Custom Source for Nginx on AWS Security Lake Console.
// 2. Setup a log collector(e.g.: Fluent-bit) on the Nginx Web Server.
// 3. Modify the output of log collector(e.g.: Fluent-bit) to a Kinesis Data Stream.
// 4. Modify the config file for log fields mapping.
// 5. Deploy this SAM template for Lambda function deployment.
// 6. Test

const fs = require('fs');
const parquet = require('parquetjs')
const date = require('date-and-time')
const uuid = require('uuid')
const AWS = require('aws-sdk')
const S3Uri = require('amazon-s3-uri')

var s3 = new AWS.S3();
var region = '';
var logBucket = '';
var template = '';
var parquetSchema = {};
var accountId = '';
var eventHour = '';
var logPath = '';
var configFile = '';
const tmpPath = '/tmp/';


exports.lambdaHandler = async (event, context) => {

    let logRecords = [];
    region = process.env.AWS_REGION;
    configFile = process.env.ConfigurationFile;
    accountId = context.invokedFunctionArn.split(':')[4];
    
    if(configFile == undefined || configFile == ''){
        console.log('Error! The configuration file cannot be empty.');
        return;
    }
    try{
        await createSchema(configFile);
        let data = event.Records;
        let awsVars = constructAwsContext(region, accountId);
        data.forEach(element => {
            let sdata = decodeData(element.kinesis.data);
            let currentEventHour = date.format(new Date(sdata.time), 'YYYYMMDDHH', true);
            if(eventHour == '')
                eventHour = currentEventHour;
            if(currentEventHour != eventHour){
                processFile(logRecords);
                logRecords = [];
                eventHour = currentEventHour;
            }
            let logRecord = '';
            logRecord = parseLogRecord(template, sdata);
            logRecord = parseLogRecord(logRecord, awsVars);
            logRecord = cleanUnusedVariables(logRecord);
            logRecords.push(logRecord);
    
        });
        await processFile(logRecords);

    }
    catch(e){
        
        console.log(e);

    }

        
};


async function processFile(logRecords){
    var fileName = uuid.v4().replaceAll('-', '') + '.parquet';  
    var schema = new parquet.ParquetSchema(parquetSchema);
    try{

        let filePath = tmpPath + fileName;
        let writer = await parquet.ParquetWriter.openFile(schema, filePath);
        
        logRecords.forEach(async element=>{
            let json = JSON.parse(element);
            await writer.appendRow(json);
    
        })
        await writer.close();
        if(fs.existsSync(filePath))
        {
            let s3Path = logPath + 'region=' + region + '/accountId=' + accountId + '/eventHour=' + eventHour + '/';
            let stream = fs.createReadStream(filePath);
            let params = {Bucket: logBucket, Key: s3Path + fileName, Body: stream};
            result = await s3.putObject(params).promise();
            fs.unlink(tmpPath + fileName, function (err) {
                if(err)
                    console.log(err);
            })
            console.log(logRecords.length + ' logs process successfully. Save into file: s3://' +  logBucket + '/' + s3Path + fileName);    
        }
    }
    catch(e)
    {
        console.log(e)
        throw e;
    }
}

function constructAwsContext(region, accountId){

    var data = {};
    data["region"] = region;
    data["accountid"] = accountId;
    return data;
}


function decodeData(b64data){

    return JSON.parse(new Buffer.from(b64data, "base64").toString());
}

function parseLogRecord(template, logData){
    for (const key in logData){
        if(logData.hasOwnProperty(key)){
            template = template.replaceAll('$' + key + '$', `${logData[key]}`);
        }
      }
    return template;
}

function cleanUnusedVariables(template){

    const regex = /\$+\w+\$/gm;
    template = template.replaceAll(regex, "");
    return template;
}

async function createSchema(definitionFile){

    let content = await getConfiguration(definitionFile)
    let defJson = JSON.parse(content);
    let tmpTemplate = {};
    let tmpFileSchema = {};
    logBucket = defJson.LogBucket;
    logPath = defJson.LogPath;
    defJson.Fields.forEach(element => {

        if(element.DataType == 'Nested'){
            let subJson = {};
            let node = {};
            let fields = {};
            let dtype = {};
            element.Struct.forEach(subElement => {
                if(subElement.SourceField != '')
                    subJson[subElement.LogField] = '$' + subElement.SourceField + '$';
                else
                    subJson[subElement.LogField] = subElement.DefaultValue;
                fields[subElement.LogField] = { type: subElement.DataType };
            })
            tmpTemplate[element.LogField] = subJson;
            node['repeated'] = false;
            node['fields'] = fields;
            tmpFileSchema[element.LogField] = node;
        }
        else
        {
            if(element.SourceField != ''){
                tmpTemplate[element.LogField] = '$' + element.SourceField + '$';
            }
            else
            {
                tmpTemplate[element.LogField] = element.DefaultValue;
            }
            tmpFileSchema[element.LogField] = { type: element.DataType };
        }
    })
    template = JSON.stringify(tmpTemplate);
    parquetSchema = tmpFileSchema;

}


async function getConfiguration(configurationFile){

    let res = S3Uri(configurationFile);
    let params = {Bucket: res.bucket, Key: res.key};
    let buffer = await (await s3.getObject(params).promise()).Body;
    return Buffer.from(buffer).toString('UTF8');
}


