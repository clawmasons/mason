



**Find PRD to modify** Find the relevant <prd-name>/PRD.md in the openspce/prds/ directory.  


Create a openspecs/prds/<prd-name>/IMPLEMENTATION.md

where you will design a implementation of the PRD.md in openspecs/prds/forge-proxy/PRD.md

Should focus on making the steps that have a concrete usable/testable output output.

Steps must be planned in a way that all tests pass at the end of each step.  

If tests need to be modified because of this change, please include it in the plan so it can be reviewed.

'''

# Implementation Steps

## CHANGE: <name>

<brief summary that will be provided to /opsx:new>

Include references to the PRD.md and this IMPLEMETNATion plan

Add a User Story if it will help clarify how the the result of the change will be used

All tests must pass on the step.  Please include tasks to run all tests and fix erorrs.  Focus fixes on changes you have made because the tests were working prior to the change.

Tests to be run:
   - npm run lint
   - npm run build
   - npm run test
   - npm run test:e2e
   - in ../mason-extensions, run `npm run lint`
   - ../mason-extensions, run `npm run build`
   - in ../mason-extensions `npm run test`
   - in ../mason-extensions `npm run test:e2e`


** Not Implemented Yet**

'''