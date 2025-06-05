# vanity-numbers
---
## Overview
A vanity number is a ohone number that transforms the numbers to the letters that match the numbers on a keypad to form memorable words often related to the business. For example, the ohone number 1-888-945-3228 can be dialed as 1-888-WILDCAT, which might benefit the marketing for a wildlife rehabilitation center. 

This project uses Amazon Connect to deliver users the best vanity options for the number they call from. 

To try it out, this function is live at ***(833) 566-6051***.

## How It Words
1. A call is made to the Amazon Connect phone number.
2. Connect asks for a word to describe your business.
3. Amazon Lex captures your spoken word and returns it to Connect.
4. The lambda is called alongside the caller number and the caller's chosen keyword.
5. The function makes a request to the [Datamuse API](https://www.datamuse.com/api/) to retieve the first 1000 words related to the words using the ml (means like) query.
6. Phone number is checked agaisnt all related words.
7. The function uses npm packages `fs` to render the words in `word-list`.
8. Matches are added to a list of vanity options until 5 are found.
9. The top vaity results are stored in DynamoDB alongside the caller number with the longest words stored first.
10. Top results, if found, are spoken to the user.

---
## "Best Logic"
This function uses three logical principals to detwermin the "best" vanity number
1. Category relevance:
   * Purpose: Words more closesly related to the business name help the user remmeber the purpose of the business.
   * Exaple: A floral business might prefer words such as ***rose***, ***petal***, or ***bloom***.
2. Vanity length:
   * Purpose: In a phone number, longer words require less digit memorization.
   * Example: A business may prefer the vanity number ***1-888-WILDCAT*** over ***+1-888-945-3BAT***.
3. Capped at 3-7 alphabetical characters:
   * Purpose: Vanity numbers with 2 or less letters are likely not memorable enough to be considered. Words with special characers also are not considered due to their inabiliyt to be translated to a keypad digit.
   * Example: ***1-800-945-32AT*** is unremarkable and ***1-800-THEY'RE*** is invalid.
  
## Shortcuts / Active Production-unready componee=nts
* Amazon Connect currently explicitly states the error for easy dubegging. Productin ready code would default all problems to a universal prompt similar to *"I'm sorry. There was an error on our end. Please try again later."*

## Unresolved issues
### Problem
* Amazon Lex listens too long leaving the user waiting several seconds before Amazon Connect delivers the next prompt
### Tried
* Removed Lambda calls from Lex
* Deactivatied confirmation, fullfillment, and closing actions
* Activated a play prompt block before calling the Lambda function

---
## Looking Forward
Several additional features could enhance the user expereince:
* Allow users to retry new keywords within the same call
* Check if the caller already has a database entry and return all previous top results, resorted to foward the best of the best
* Create a customized word list that is prioritized over `word-list` with build-in categories more easily recognizable when spoken to Lex.
* Concactenated word matches like ***GOOD DOG***
