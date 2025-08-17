// ==UserScript==
// @name Fallen London - Contacts Favours & Agents Durations
// @namespace Fallen London - Contacts Favours
// @author Laurvin
// @description Shows the Favours and Agents duration to the right or top of the page; will check every 10 seconds if the data is still there. To refresh click anywhere in the area, te relocate click the compass.
// @version 6.2
// @icon http://i.imgur.com/XYzKXzK.png
// @downloadURL https://github.com/Laurvin/Fallen-London-Contacts-Favours/raw/master/Fallen_London_Contacts_Favours.user.js
// @updateURL https://github.com/Laurvin/Fallen-London-Contacts-Favours/raw/master/Fallen_London_Contacts_Favours.user.js
// @match https://fallenlondon.com/*
// @match https://www.fallenlondon.com/*
// @require http://ajax.googleapis.com/ajax/libs/jquery/3.2.1/jquery.min.js
// @grant GM_setValue
// @grant GM_getValue
// @grant GM_registerMenuCommand
// @run-at document-idle
// ==/UserScript==

/* globals jQuery, $ */

this.$ = this.jQuery = jQuery.noConflict(true);

function addGlobalStyle(name, css) {
    if (!document.querySelector('head style[data-id="' + name + '"]')) {
        const styleEl = document.createElement('style');
        styleEl.setAttribute('data-id', name);
        styleEl.innerHTML = css;
        document.head.appendChild(styleEl);
    }
}

function addHTMLElements(divLocation) {
    addGlobalStyle('RightFLCF', '#RightFLCF { width: auto; margin: 18px 2px -17px 2px; text-align: center; font-size: 14px; }');
    addGlobalStyle('TopFLCF', '#TopFLCF { width: 72%; margin: 7px 0px; font-size: 14px; }');
    addGlobalStyle('FLCFGrid', '#FLCF { display: grid; grid-template-columns: repeat(auto-fill, minmax(40px, 1fr)); column-gap: 0.3rem; row-gap: 0.2rem;; }');
    addGlobalStyle('FLCFItems', '#FLCF .item { display: flex; align-items: center; }');

    $('#RightFLCF').remove();
    $('#TopFLCF').remove();

    GM_setValue("divLocation", divLocation);
    var MoveButtonLocation = "";

    if (divLocation == 'top') {
        $('.top-stripe__site-title').remove();
        $('.top-stripe__inner-container').prepend('<div id="TopFLCF"><div id="ContainerFLCF"></div></div>');
        MoveButtonLocation = "right";
    } else {
        $('button.travel-button--infobar').after('<div id="RightFLCF"><div id="ContainerFLCF"></div></div>');
        MoveButtonLocation = "top";
    }

    $('#ContainerFLCF').append('<div id="FLCF" title="You can click anywhere here to reload. To move the icons to the top or right, use the Tampermonkey menu.">Loading Contact Favours...</div>');
}

function fetchFavoursData(callback) {
    var access_token = localStorage.getItem("access_token");
    if (access_token == null) access_token = sessionStorage.getItem("access_token");

    $.ajax({
        method: 'GET',
        url: 'https://api.fallenlondon.com/api/character/myself',
        headers: {
            "authorization": "Bearer " + access_token,
            "accept": "application/json, text/plain, */*"
        },
        timeout: 10000,
        success: function(result) {
            callback(null, result);
        },
        error: function(xhr, status, errorThrown) {
            callback({ status: status, error: errorThrown }, null);
        }
    });
}

function fetchAgentsData(callback) {
    var access_token = localStorage.getItem("access_token");
    if (access_token == null) access_token = sessionStorage.getItem("access_token");

    $.ajax({
        method: 'GET',
        url: 'https://api.fallenlondon.com/api/agents',
        headers: {
            "authorization": "Bearer " + access_token,
            "accept": "application/json, text/plain, */*"
        },
        timeout: 10000,
        success: function(result) {
            callback(null, result);
        },
        error: function(xhr, status, errorThrown) {
            callback({ status: status, error: errorThrown }, null);
        }
    });
}

function GetFavours() {
    fetchFavoursData(function(err, MySelfData) {
        if (err) {
            console.log("Error! " + err.status + " " + err.error);
            $('#FLCF').text("Error! " + err.status + " " + err.error);
            GetFavours();
            return;
        }

        var Favours = {
            'Favours: Criminals': 0, 'Favours: The Docks': 0, 'Favours: Tomb-Colonies': 0, 'Favours: Rubbery Men': 0, 'Favours: Urchins': 0, 'Favours: Hell': 0, 'Favours: Constables': 0, 'Favours: The Great Game': 0, 'Favours: The Church': 0, 'Favours: Bohemians': 0, 'Favours: Revolutionaries': 0, 'Favours: Society': 0
        };

        var FactionIcon = {
            'Favours: Criminals': 'manacles', 'Favours: The Docks': 'ship', 'Favours: Tomb-Colonies': 'bandagedman', 'Favours: Rubbery Men': 'rubberyman', 'Favours: Urchins': 'urchin', 'Favours: Hell': 'devil', 'Favours: Constables': 'constablebadge', 'Favours: The Great Game': 'pawn', 'Favours: The Church': 'clergy', 'Favours: Bohemians': 'bohogirl1', 'Favours: Revolutionaries': 'flames', 'Favours: Society': 'salon2'
        };

        var contactsID, storiesID;
        for (var i = 0; i < MySelfData.possessions.length; i++) {
            if (MySelfData.possessions[i].name == "Contacts") contactsID = i;
            if (MySelfData.possessions[i].name == "Stories") storiesID = i;
        }

        for (i = 0; i < MySelfData.possessions[contactsID].possessions.length; i++) {
            if (MySelfData.possessions[contactsID].possessions[i].name in Favours) {
                Favours[MySelfData.possessions[contactsID].possessions[i].name] = MySelfData.possessions[contactsID].possessions[i].level;
            }
        }

        var tasteGarden = 0;
        for (i = 0; i < MySelfData.possessions[storiesID].possessions.length; i++) {
            if (MySelfData.possessions[storiesID].possessions[i].qualityPossessedId == 69445506) {
                tasteGarden = MySelfData.possessions[storiesID].possessions[i].level;
            }
        }

        var CreatedHTML = "";
        $.each(Favours, function(faction, amount) {
            CreatedHTML += '<div class="item reload"><img height="20" width="20" border="0" src="https://images.fallenlondon.com/icons/' + FactionIcon[faction] + 'small.png" />&nbsp;' + amount + '</div>';
        });

        if (tasteGarden > 0) {
            CreatedHTML += '<div class="item reload"><img height="20" width="20" border="0" src="https://images.fallenlondon.com/icons/foliagesmall.png" />&nbsp;' + tasteGarden + '</div>';
        }

        if (MySelfData.character.mantelpieceItem.image) {
            CreatedHTML += '<div class="item reload"><img height="20" width="20" border="0" src="https://images.fallenlondon.com/icons/' + MySelfData.character.mantelpieceItem.image + 'small.png" />&nbsp;' + MySelfData.character.mantelpieceItem.effectiveLevel + '</div>';
        }

        if (MySelfData.character.scrapbookStatus.image) {
            CreatedHTML += '<div class="item reload"><img height="20" width="20" border="0" src="https://images.fallenlondon.com/icons/' + MySelfData.character.scrapbookStatus.image + 'small.png" />&nbsp;' + MySelfData.character.scrapbookStatus.effectiveLevel + '</div>';
        }

        fetchAgentsData(function(agentErr, agentsData) {
            if (!agentErr && agentsData && Array.isArray(agentsData.agents)) {
                agentsData.agents.forEach(function(agent) {
                    var remaining = 0;
                    if (agent.plot && typeof agent.plot.duration === 'number' && typeof agent.plot.elapsed === 'number') {
                        remaining = agent.plot.duration - agent.plot.elapsed;
                    }
                    var imgSrc = agent.image ? 'https://images.fallenlondon.com/icons/' + agent.image + 'small.png' : '';
                    if (imgSrc) {
                        CreatedHTML += '<div class="item reload"><img height="20" width="20" border="0" src="' + imgSrc + '" />&nbsp;' + remaining + '</div>';
                    }
                });
            }

            $("#FLCF").html(CreatedHTML);
            $('.item.reload').click(function(event) {
                event.preventDefault();
                $('#FLCF').text("Loading Contact Favours...");
                GetFavours();
            });
        });
    });
}

function updateFavours(divLocation) {
    if (!document.querySelector('#FLCF')) {
        addHTMLElements(divLocation);
        GetFavours();
    }
}

$(document).ready(function() {
    'use strict';
    var divLocation = GM_getValue("divLocation", 'right');

    // Menu to change the choice
    const KEY = 'divLocation'; // storage key
    const DEFAULT = 'right'; // starting value if none saved
    const ALT = { right: 'top', top: 'right' };

    // Read saved value (or use default)
    let current = GM_getValue(KEY, DEFAULT);

    // Apply immediately
    updateFavours(current);

    // Menu to toggle
    GM_registerMenuCommand(`Position: ${current} (toggle)`, async () => {
        current = ALT[current]; // flip the value
        await GM_setValue(KEY, current);
        updateFavours(current);
        Optional: alert(`You will need to reload the page to move the icons to the ${current}`);
    });

    setInterval(updateFavours, 10000, divLocation);
});
