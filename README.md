# Fallen-London-Contacts-Favours-&-Agents-Durations
This userscript shows how many Favours you have for each Faction and will also show the current value for Taste of the Garden (if you have it) and the values for your Mantlepiece and Scrapbook items.

It also shows the mission durations (how many actions till they return) of any of Agents you might have. Use the Tampermonkey/Violentmonkey menu to have the Agent(s) show up on their own line or not.

All the information is shown either at the side of the page (below the Travel button) or at the top of the page (in place of the Fallen London logo). Use the Tampermonkey/Violentmonkey menu to select which of the two locations to use.

![Screenshot](https://github.com/Laurvin/Fallen-London-Contacts-Favours---Agents-Durations/blob/master/Screenshot%207.0.png)

The Favours will update as you play, you should see them go up and down as you gain/spend them.

The Agents info is only taken directly from the game on page load and when you go to the Agents tab. The decrease of their mission duration is done programmatically. Any time you click a Go button it will decrease the mission duration with the cost of the button (0, 1, 2, 5, etc.). If you click a button right as your candle gains an action, this might cause a discrepancy. With this slight chance of drift, if you want to be absolutely sure not to miss the arrival of an Agent, check their tab when their arrival is getting close to zero.

When you change your Mantlepiece or Scrapbook item, the script won't update to it automatically; you'll need to reload.

The script takes it's information directly from the game and shouldn't need to use the API to get the Myself data but you can still click the button bar/square to do a manual reload.
