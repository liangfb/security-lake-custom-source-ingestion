# A Lambda function - ingest custom logs into AWS Security Lake

This project used for receive the logs from your custom sources and write them to the AWS Security Lake using OCSF format.

The OCSF specification: https://schema.ocsf.io/. 

We provided a sample configuration for Nginx: [log-schema-config.json](security-lake-custom-source-ingestion-lambda/config-example/log-schema-config.json)

## Example: Collect Nginx access log to AWS Security Lake:
- Create custom source for Nginx on AWS Security Lake Console.
- Setup a log collector(e.g.: Fluent-bit) on the Nginx Web Server.
- Config the log collector(e.g.: Fluent-bit) output to a Kinesis Data Stream.
- Clone repositority, modify the config file for log fields mapping
  - Change the LogBucket, LogPath and fields mapping.
  - Upload configuration file to a S3 bucket.
- Modify the SAM template(template.yaml) and deploy the Lambda function.
  - Change the values of Role, Stream and ConfigurationFile properties.
  - Run command: ```cd security-lake-custom-source-ingestion-lambda && npm install```
  - Use SAM CLI or Cloud9 to deploy.
- Monitor the Lambda execution in CloudWatch Logs.
