

# Packages Test Standards
* package unit tests will go in packages/{package}/tests
* package integration tests will go in packages/{packages}/integration
* both unit and integration tests can be grouped in logical subdirectorys

Test Requirements
* Unit test can not call external processes or tools
* Unit tests can call other packages that are dependencies of the current package
* Unit tests can mock functions 
* Integration tests can call external tools (like docker)
* Integration tests can mock functions and configuration


At the start of any work on tests, acknowledge that you have read and agree to the "E2E Test Standards"

Ask the user to confirm your acknoledgement and understanding, especially if the user is asking you to do something that violates the E2E Test Standards