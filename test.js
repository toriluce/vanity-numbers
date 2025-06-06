import dotenv from "dotenv";
dotenv.config();

import { handler } from "./index.js";

const endpointAddress = "1-888-945-3228";
const category = "aat";

(async () => {
  const validatingEvent = {
    Details: {
      Parameters: {
        validatingCaller: "true",
      },
      ContactData: {
        CustomerEndpoint: {
          Address: endpointAddress,
        },
      },
    },
  };

  const newSearchEvent = {
    Details: {
      Parameters: {
        ValidatingCaller: "false",
        Category: category,
      },
      ContactData: {
        CustomerEndpoint: {
          Address: endpointAddress,
        },
      },
    },
  };

  console.log("\x1b[36m%s\x1b[0m", "Test 1: Validating Caller");
  try {
    const result1 = await handler(validatingEvent);
    console.log(JSON.stringify(result1, null, 2));
  } catch (error) {
    console.error("Error in Test 1:", error);
  }

  console.log("\x1b[36m%s\x1b[0m", "Test 2: New Category Search");
  try {
    const result2 = await handler(newSearchEvent);
    console.log(JSON.stringify(result2, null, 2));
  } catch (error) {
    console.error("Error in Test 2:", error);
  }
})();
