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

//Author: Liang Fengbiao
//Data source from Kinesis Data Stream

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
        
        let configJson = await getConfiguration(configFile);
        if(configJson == undefined){
            console.log('Configuration file is invalid.');
            return;
        }

        logBucket = configJson.LogBucket;
        logPath = configJson.LogPath;
        await createSchemaAndTemplate(configJson);
        
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
    for (let key in logData){

        if(typeof logData[key] == 'object'){
            template = parseLogRecord(template, logData[key])
        }
        else{
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

async function createSchemaAndTemplate(configJson){

    let tmpTemplate = {};
    configJson.Fields.forEach(element => {
        parquetSchema[element.LogField] = createNestedSchema(element);
        tmpTemplate[element.LogField] = createNestedTemplate(element);
   
       });
    template = JSON.stringify(tmpTemplate);
    
}


function createNestedSchema(element){


    let node = {};
    let fields = {};
    if(element.DataType == 'Nested'){
        node['repeated'] = false;
        element.Struct.forEach(subElement => {

            if(subElement.DataType == 'Nested'){
                node['repeated'] = false;
                fields[subElement.LogField] = createNestedSchema(subElement,node);
            }
            else
                fields[subElement.LogField] = { type: subElement.DataType };
    
        });
        node['fields'] = fields;
    }
    else{
        node = { type: element.DataType };
    }
    return node;
}

function createNestedTemplate(element){

    let subJson = {};
    let node = {};
    let fields = {};
    let dtype = {};
    if(element.DataType == 'Nested'){

        element.Struct.forEach(subElement => {

            if(subElement.DataType == 'Nested'){
                subJson[subElement.LogField] = createNestedTemplate(subElement);
            }
            else{
                if(subElement.SourceField != '')
                subJson[subElement.LogField] = '$' + subElement.SourceField + '$';
            else
                subJson[subElement.LogField] = subElement.DefaultValue;
            }

        })

    }
    else
    {
        if(element.SourceField != undefined && element.SourceField != ''){
            return '$' + element.SourceField + '$';
        }
        else
        {
            return element.DefaultValue;
        }
    }
    return subJson;
    
}


async function getConfiguration(configurationFile){

    try{
        
        let res = S3Uri(configurationFile);
        let params = {Bucket: res.bucket, Key: res.key};
        let buffer = await (await s3.getObject(params).promise()).Body;
        let fileContent = Buffer.from(buffer).toString('UTF8');
        if(fileContent == '')
            return undefined;
        else
            return JSON.parse(fileContent);
    }
    catch(e){
        console.log(e);
        return undefined;
    }
    
}