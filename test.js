import dotenv from "dotenv";
dotenv.config();

import { handler } from "./index.js";

(async () => {
  const testEvent = {
    Details: {
      Parameters: {
        phoneNumber: "+10000008674",
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
