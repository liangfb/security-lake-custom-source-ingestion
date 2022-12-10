# A Lambda function - ingest custom logs into AWS Security Lake

## Usage

- Create Custom Source for Nginx on AWS Security Lake Console.
- Setup a log collector(e.g.: Fluent-bit) on the Nginx Web Server.
- Modify the output of log collector(e.g.: Fluent-bit) to a Kinesis Data Stream.
- Modify the config file for log fields mapping(an example under "config-example" folder).
- Modify the SAM template(template.yaml) and deploy the Lambda function.
- Monitor the Lambda execution in CloudWatch Logs.
