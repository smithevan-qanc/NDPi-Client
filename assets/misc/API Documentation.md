# External
- These are API endpoints that are available to external origins.
- Primary Path: `http://[IP]:[PORT]/api/v1`
---
1. `/rpc` 
    - **Method: `GET`**
       - `type={Type}`
       - `data={Data}`
       - **Types**
         - `show-blank`
         - `show-overlay`
         - `set-overlay`
         - `set-source`


# Internal
- These are API endpoints that are only available for `localhost`. The primary use is for communication between modules.
- Primary Path: `http://localhost:[PORT]/api/v1/__internal`
---
