# A Lambda function - ingest custom logs into AWS Security Lake

This project used for receive the logs from your custom sources and write them to the AWS Security Lake using OCSF format.

The OCSF specification: https://schema.ocsf.io/. 

We provided a sample configuration for Nginx: [log-schema-config.json](security-lake-custom-source-ingestion-lambda/config-example/log-schema-config.json)

## Example: Collect Nginx access log to AWS Security Lake:
- Create custom source for Nginx on AWS Security Lake Console.
- Setup a log collector(e.g.: Fluent-bit) on the Nginx Web Server.
- Config the log collector(e.g.: Fluent-bit) output to a Kinesis Data Stream.
- Modify the config file for log fields mapping, the LogField maps to an OCSF log field and the SourceField is maps to a field of your log entity.
- Modify the SAM template(template.yaml) and deploy the Lambda function.
- Monitor the Lambda execution in CloudWatch Logs.
