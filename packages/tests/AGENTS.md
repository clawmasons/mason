

In the e2e tests we are testing the command line inputs and outputs, not internal

# E2E Test Standards
All e2e tests: 

* SHOULD: Use a fixture directory for common setups
   place fixtures in the "fixtures" directory, which the full path in this project is "/e2e/fixtures"

* MUST: JUST run the command line.

* MUST: test inputs/outputs of the command line and artifacts generated.

**If you need to mock something out, then that should be a non-e2e test OR the command line is broken and may need to be fixed.**

non-e2e cli test locations
* if the test just requires mocks and can run without external calls then add it to (package/cli/test)

* If it requires mocks and external things like docker, then it should be an integration test (packages/cli/test/integration)

or if you are testing another package, put it in that packages/{package}/tests or packages/{package}/tests/integration directory

At the start of any work on e2e tests, acknowledge that you have read and agree to the "E2E Test Standards"

Ask the user to confirm your acknoledgement and understanding, especially if the user is asking you to do something that violates the E2E Test Standards


