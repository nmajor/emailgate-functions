serverless deploy

serverless invoke local --function emailPdf


3. **Create a Service:**

  You can create a new service or [install existing services](#how-to-install-a-service).
  ```bash
  # Create a new Serverless Service/Project
  serverless create --template aws-nodejs --path my-service
  # Change into the newly created directory
  cd my-service
  ```

4. **Deploy a Service:**

  Use this when you have made changes to your Functions, Events or Resources in `serverless.yml` or you simply want to deploy all changes within your Service at the same time.
  ```bash
  serverless deploy -v
  ```

5. **Deploy the Function:**

  Use this to quickly upload and overwrite your AWS Lambda code on AWS, allowing you to develop faster.
  ```bash
  serverless deploy function -f hello
  ```

6. **Invoke the Function:**

  Invokes an AWS Lambda Function on AWS and returns logs.
  ```bash
  serverless invoke -f hello -l
  ```

7. **Fetch the Function Logs:**

  Open up a separate tab in your console and stream all logs for a specific Function using this command.
  ```bash
  serverless logs -f hello -t
  ```

8. **Remove the Service:**

  Removes all Functions, Events and Resources from your AWS account.
  ```bash
  serverless remove
