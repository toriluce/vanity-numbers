import dotenv from "dotenv";
dotenv.config();

import { handler } from "./index.js";

(async () => {
  const testEvent = {
    Details: {
      ContactData: {
        Attributes: {
          Category: "pet",
        },
        CustomerEndpoint: {
          Address: "+18009453228",
        },
      },
    },
  };

  try {
    const result = await handler(testEvent);
    console.log("Lambda Response:", JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("Error running handler:", error);
  }
})();
