# vanity-numbers
---
## Overview
A vanity number is a phone number that spells out a memorable word or phrase using the letters associated with the digits on a telephone keypad. These numbers are often tied to a company’s name, industry, or branding. For example, the phone number ***1-888-945-3228*** can be dialed as ***1-888-WILDCAT***, which might benefit the marketing of a zoo or wildlife hotline.

This project is built using Node.js and JavaScript, and works with several AWS services including Amazon Connect (for call handling), AWS Lambda (for on-demand backend processing), DynamoDB (for data storage), and Amazon Lex (for voice-based input). Logging and testing are supported through CloudWatch, with secure permissions managed via IAM.

The system also uses the [Datamuse API](https://www.datamuse.com/api/) to fetch related words by category, and the npm package [word-list](https://www.npmjs.com/package/word-list) for fallback word matching, helping deliver the best possible vanity options based on the caller's phone number and chosen category.

To try it out, this function is live at ***(833) 566-6051***.

## How It Works
1. A call is made to the Amazon Connect phone number.
2. Connect utilizes a contact flow that first prompts the caller for a category they’d like to use for the vanity number search.
3. Amazon Lex captures spoken input, identifies the `GetCustomerBusinessCategory` intent, and intelligently recognizes the user’s category, storing it in the `CategorySlot` and returning it to Connect where it is stored as a contact attribute.
4. Connect invokes the Lambda function, passing the caller number and category through the event.
5. The Lambda uses `axios` to request up to 1000 words related to the caller’s category from the Datamuse API using the` ml=` (means like) query.
6. The Lambda steps through the last 7 digits or the phone number, first checking for 7-letter word vanity matches. If none are found, it shifts to the 6th-to-last digit and words are compared with 6 letters, then continues the process for 5, 4, and 3 letter words until finding five matches or exhausting the list.
7. If fewer than five matches are found, the Lambda then utilizes the `word-list` package, and via `fs`, gathers a large list of words to start a second iterative search for the remaining five vanity matches.
8. The top vanity results are stored in DynamoDB alongside the caller number in order of “best.”
9. Connect checks the `hasVanityResults` attribute from the Lambda response to determine the prompt for the user, giving up to the top three results or apologizing if none are found.
10. The Connect flow reaches a disconnect block.
    
![Screenshot of Amazon Connect flow used for vanity number generation for customers.](https://raw.githubusercontent.com/toriluce/vanity-numbers/refs/heads/main/Amazon%20Connect%20Vanity%20Number%20Flow.png)
Above: Amazon Connect vanity number flow diagram.

## "Best" Vanity Number Logic
This function uses three logical principles to determine the "best" vanity number
1. Category Relevance:
   * Purpose: Words more closely related to the caller's business category can help reinforce the purpose of the number and improve memorability.
   * Example: A floral business might prefer words such as ***ROSE***, ***PETAL***, or ***BLOOM***.
2. Longest Length:
   * Purpose: In a vanity number, longer words reduce the number of digits the caller needs to memorize, making the number more brandable and impactful.
   * Example: A business may prefer the vanity number ***1-888-WILDCAT*** over ***+1-888-945-3BAT***.
3. Word Validity (3-7 Alphabetical Characters):
   * Purpose: Vanity words under 3 characters are likely not memorable enough to be considered. Words with special characters also are not considered due to their inability to be translated to a keypad digit.
   * Example: ***1-800-945-32AT*** is unremarkable and ***1-800-THEY'RE*** is invalid.
  
## Shortcuts / Active Production-Unready Components
The following decisions were made to prioritize fast development and debugging, but would be revised in a production environment:
* **Explicit error messaging in Connect**  
  Amazon Connect currently plays detailed error prompts for easy debugging. In production the contact flow might default all errors to a universal prompt similar to:
  >"I'm sorry. There was an error on our end. Please try again later."
* **Unencrypted phone numbers**  
  Phone numbers are stored in DynamoDB without encryption for simplicity during development. In a production environment, this data should be protected using:
  - AWS Key Management Service (KMS) for at-rest encryption
  - User-side encryption within Lambda
  - CloudWatch log filtering or masking to prevent logging sensitive data using data protection policies
* **Over-broad IAM permissions**    
  Some IAM roles currently include wildcard access (*) for convenience. In production, permissions should be narrowed to strictly necessary scope.


## Unresolved Issues

1. **Problem:**  
   Amazon Lex listens too long, leaving the user waiting several seconds before Amazon Connect delivers the next prompt.  

   **Attempts at Resolving:**
   - Removed Lambda calls from Lex  
   - Deactivated confirmation, fulfillment, and closing actions  
   - Activated a Play Prompt block before invoking the Lambda function to check if the delay was caused by the Lambda  

   Despite these changes, the delay remains noticeable.

## Looking Forward
Several additional features could enhance the user experience and vanity number discovery:
* **Keyword retries within the same call:**    
  Allow users to provide a new category if no matches we found or if they would like to continue exploring more options.
* **Call history checks:**    
  Detect returning callers by phone number lookup and return all previous top results, resorted to forward the best of the best.
* **Custom word list with built-in categories:**  
  Create a hand-crafted word list that is prioritized over `word-list` with build-in categories, making spoken words more easily recognizable to Lex and provide more meaningful vanity results.
* **Concatenated word matches:**  
   Support layered words like ***1-800-GOOD-DOG*** to provide longer vanity matches.
* **Over-spell option:**  
  Give users the option to search vanity words that extend beyond 7 letters similar to the one used in ***1-800-MATTRESS***.
* **Phonetic and alternative spelling support:**  
  Add functionality that substitutes dictionary words for phonetic spellings like ***1-800-888-DOGZ*** which would provide more potential options.

