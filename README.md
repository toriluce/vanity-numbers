# vanity-numbers
---
## Overview
A vanity number is a phone number that spells out a memorable word or phrase using the letters associated with the digits on a phone keypad. The words chosen to replace a number's numerical digits are often tied to a company’s name, industry, or branding. For example, the phone number ***1-888-945-3228*** can be dialed as ***1-888-WILDCAT***, which might benefit the marketing of a zoo or wildlife hotline. 

The goal for this project was to create a call center experience that allows users to dial in, have their phone number automatically captured, and receive intelligently selected vanity word replacements that they can then use to brand their current phone number.

This project is built using Node.js, and works with several AWS services including Amazon Connect (for call handling), AWS Lambda (for serverless backend processing), DynamoDB (for data storage), and Amazon Lex (for voice-based input). 

The system also utilizes the [Datamuse API](https://www.datamuse.com/api/) to fetch related words based on any caller-selected category, and the npm package [word-list](https://www.npmjs.com/package/word-list) to collect a full dictionary of words to compare as a fallback to their related words, helping deliver the best possible vanity options.

To try it out, the call center is live at ***(833) 566-6051***.

## How It Works
**Initial Call & Lookup**  

A customer calls the Amazon Connect phone number. The call is routed through a contact flow that first invokes a Lambda function to check whether the caller’s phone number exists in a DynamoDB table.  

**New Caller Pathway**  
1. If the caller is not listed in the database, Connect then prompts the caller for a category they’d like to use for the vanity number search.
2. Amazon Lex captures spoken input, identifies the `GetCustomerBusinessCategory` intent, and intelligently recognizes the user’s category, storing it in the `CategorySlot` and returning it to Connect where it is stored as a contact attribute.
3. Connect invokes the Lambda function again, this time passing both the caller number and category through the event.  
4. The Lambda uses `axios` to request up to 1000 words related to the caller’s category from the Datamuse API using the `ml=` (means like) query.  
5. The Lambda steps through the last 7 digits of the phone number, first checking for 7-letter word vanity matches. If none are found, it shifts to the 6th-to-last digit and words are compared with 6 letters. This process continues for 5, 4, and 3 letter words until reaching five matches or exhausting the list.  
6. If fewer than five matches are found in the category-word list, the Lambda then utilizes the `word-list` package, and via `fs`, gathers a large list of words to start a second iterative search for the remaining five vanity matches.  
7. After the function is completed, Connect checks the `hasVanityResults` attribute from the Lambda response to determine a prompt for the user, giving either the top three results or a message that no matches were found.  
8. Connect then asks the caller if they would like to try another word, putting them on the returning caller pathway.

**Returning Caller Pathway**  
In the case that the caller already has an entry in the database, their current all-time "best" vanity result is returned from the initial Lambda call. 
The caller is then asked if they would like to use a new category word to query for better-matched vanity options.

**Storing Results**  
Every new result is compared against the caller's previous entries. Unique vanity matches are added to a DynamoDB table, sorted into a list of all-time matches in order of "best": results that originated from a category-word list from longest to shortest, then fallback results from longest to shortest. If an entry that was originally a fallback word is found in a category list, that word is matched with its category and listed more valuably.    

**Call Completion**  
If the caller does not respond, the Connect flow reaches a disconnect block.
    
![Screenshot of Amazon Connect flow used for vanity number generation for customers.](https://raw.githubusercontent.com/toriluce/vanity-numbers/refs/heads/main/Amazon%20Connect%20Vanity%20Number%20Flow.png)
Above: The Amazon Connect vanity number flow diagram.

## "Best" Vanity Number Logic
This function uses three logical principles to determine the "best" vanity number
1. Category Relevance:
   * Purpose: Words more closely related to the caller's category can help reinforce the purpose of the number and improve memorability.
   * Example: A floral business might prefer words such as ***ROSE***, ***PETAL***, or ***BLOOM***.
2. Longest Length:
   * Purpose: In a vanity number, longer words reduce the number of digits the caller needs to memorize, making the number more brandable and impactful.
   * Example: A business may prefer the vanity number ***1-888-WILDCAT*** over ***+1-888-945-3BAT***.
3. Word Validity (3-7 Alphabetical Characters):
   * Purpose: Vanity words under 3 characters are likely not memorable enough to be considered. Words with special characters also are not considered due to their inability to be translated to a keypad digit.
   * Example: ***1-800-945-32AT*** is unremarkable and ***1-800-THEY'RE*** is invalid.
  
## Shortcuts / Active Production-Unready Components
The following decisions were made to prioritize fast development and debugging, but would be revised in a production environment:
* **Unencrypted phone numbers**  
  Phone numbers are stored in DynamoDB and communicatated throughout the system without encryption in order to simplify development. In a production environment, this data should be protected using, and not limited to, the following:
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

   Despite these changes, the delay remains noticeable. The delay is longer when cold starting (~7s) and shorter after a second call (~3s).  

## Looking Forward
Several additional features could enhance the user experience and vanity number discovery:
* **Custom word list with built-in categories:**  
  Create a hand-crafted word list that is prioritized over `word-list` with built-in categories, making spoken words more easily recognizable to Lex and providing more meaningful vanity results.
* **Concatenated word matches:**  
   Support layered words like ***1-800-GOOD-DOG*** to provide longer vanity matches.
* **Over-spell option:**  
  Give users the option to search vanity words that extend beyond 7 letters, similar to the one used in ***1-800-MATTRESS*** (not always possible with some carriers/regions).
* **Phonetic and alternative spelling support:**  
  Add functionality that substitutes dictionary words for phonetic spellings like ***1-800-888-DOGZ*** which would provide more potential options.
