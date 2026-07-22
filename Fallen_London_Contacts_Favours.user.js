// ==UserScript==
// @name Fallen London - Contacts Favours & Agents Durations
// @namespace Fallen London - Contacts Favours
// @author Laurvin
// @description Shows the Favours and Agents duration to the right or top of the page. Data is read passively from the game's own API calls; click anywhere in the area to force a manual refresh, to relocate use the Tampermonkey menu.
// @version 7.3
// @icon http://i.imgur.com/XYzKXzK.png
// @downloadURL https://github.com/Laurvin/Fallen-London-Contacts-Favours/raw/master/Fallen_London_Contacts_Favours.user.js
// @updateURL https://github.com/Laurvin/Fallen-London-Contacts-Favours/raw/master/Fallen_London_Contacts_Favours.user.js
// @match https://fallenlondon.com/*
// @match https://www.fallenlondon.com/*
// @require http://ajax.googleapis.com/ajax/libs/jquery/3.2.1/jquery.min.js
// @grant GM_setValue
// @grant GM_getValue
// @grant GM_registerMenuCommand
// @grant unsafeWindow
// @sandbox JavaScript
// @run-at document-start
// ==/UserScript==

/* globals jQuery, $, exportFunction */

this.$ = this.jQuery = jQuery.noConflict(true);

var FactionIcon = {
    'Favours: Criminals': 'manacles', 'Favours: The Docks': 'ship', 'Favours: Tomb-Colonies': 'bandagedman', 'Favours: Rubbery Men': 'rubberyman', 'Favours: Urchins': 'urchin', 'Favours: Hell': 'devil', 'Favours: Constables': 'constablebadge', 'Favours: The Great Game': 'pawn', 'Favours: The Church': 'clergy', 'Favours: Bohemians': 'bohogirl1', 'Favours: Revolutionaries': 'flames', 'Favours: Society': 'salon2'
};

// All displayed data lives here. It is filled by intercepting the game's own
// API responses; the direct fetch functions below are only used as a fallback
// and for manual refreshes.
var FLData = {
    favoursSeen: false,
    favours: {},
    tasteGarden: 0,
    mantel: null,
    scrapbook: null,
    agents: null,
    lastActions: null,
    branchCosts: {}
};

function resetFavours() {
    FLData.favours = {
        'Favours: Criminals': 0, 'Favours: The Docks': 0, 'Favours: Tomb-Colonies': 0, 'Favours: Rubbery Men': 0, 'Favours: Urchins': 0, 'Favours: Hell': 0, 'Favours: Constables': 0, 'Favours: The Great Game': 0, 'Favours: The Church': 0, 'Favours: Bohemians': 0, 'Favours: Revolutionaries': 0, 'Favours: Society': 0
    };
}
resetFavours();

// ---------------------------------------------------------------------------
// Passive interception of the game's own API calls (Sheetifier technique).
// Wraps XMLHttpRequest.prototype.open in the page context so every response
// the game receives can be inspected without any extra server requests.
// ---------------------------------------------------------------------------
(function() {
    try {
        var pageWindow = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
        var xhrProto = pageWindow.XMLHttpRequest.prototype;
        var origOpen = xhrProto.open;
        var origSend = xhrProto.send;

        // Request bodies, keyed by the request they belong to, so the branch
        // handler can see which branchId was chosen. A WeakMap keeps the
        // bookkeeping on the sandbox side, invisible to the page.
        var requestBodies = new WeakMap();

        function handleResponse() {
            try {
                if (this.readyState !== 4 || this.status !== 200) return;

                var url = this.responseURL || '';
                var data;

                if (url.indexOf('/api/storylet/choosebranch') !== -1 || url.indexOf('/api/agents/branch') !== -1) {
                    data = JSON.parse(this.responseText);
                    if (data) {
                        recordBranchCosts(data);
                        onBranchData(data, requestBodies.get(this));
                    }
                } else if (url.indexOf('/api/character/myself') !== -1) {
                    data = JSON.parse(this.responseText);
                    if (data) onMyselfData(data);
                } else if (url.indexOf('/api/storylet') !== -1) {
                    data = JSON.parse(this.responseText);
                    if (data) recordBranchCosts(data);
                } else if (url.indexOf('/api/agents') !== -1) {
                    data = JSON.parse(this.responseText);
                    console.log('FLCF: agents-related response intercepted: ' + url);
                    if (data) onAgentsData(data);
                }
            } catch (e) {}
        }

        // In the Firefox sandbox, page objects are seen through Xray wrappers
        // and page code must never receive a sandbox object. In particular,
        // origOpen.apply(this, arguments) resolves to the PAGE's apply, which
        // then cannot read the sandbox's arguments object ("Permission denied
        // to access property 'length'", breaking every request the game makes).
        // The sandbox's own Reflect.apply marshals the arguments correctly.
        function hookedOpen() {
            try {
                this.addEventListener('readystatechange', handleResponse);
            } catch (e) {}
            var args = Array.prototype.slice.call(arguments);
            try {
                return Reflect.apply(origOpen, this, args);
            } catch (e) {
                // Last resort: positional call with primitive arguments only,
                // so the game's request always goes through.
                if (args.length <= 2) return origOpen.call(this, String(args[0]), String(args[1]));
                return origOpen.call(this, String(args[0]), String(args[1]), !!args[2], args[3], args[4]);
            }
        }

        function hookedSend() {
            try {
                if (typeof arguments[0] === 'string') {
                    requestBodies.set(this, arguments[0]);
                }
            } catch (e) {}
            var args = Array.prototype.slice.call(arguments);
            try {
                return Reflect.apply(origSend, this, args);
            } catch (e) {
                // Last resort so the game's request always goes through.
                return (args.length === 0) ? origSend.call(this) : origSend.call(this, args[0]);
            }
        }

        // When sandboxed (Firefox), the wrapper must be exported to the page
        // compartment; when the script runs directly in the page context
        // (Chrome), a plain same-compartment assignment is correct.
        var replacement = hookedOpen;
        var replacementSend = hookedSend;
        if (typeof exportFunction === 'function' && pageWindow !== window) {
            replacement = exportFunction(hookedOpen, pageWindow);
            replacementSend = exportFunction(hookedSend, pageWindow);
        }
        xhrProto.open = replacement;
        xhrProto.send = replacementSend;
        console.log('FLCF: XHR hook installed (' + ((replacement === hookedOpen) ? 'page context' : 'sandbox, exported') + ')');
    } catch (e) {
        // Hook could not be installed; the fallback fetch will handle data.
        console.log('FLCF: XHR hook not installed, using direct API calls.', e);
    }
}());

// Full character snapshot: favours, Taste of the Garden, mantelpiece, scrapbook.
function onMyselfData(MySelfData, source) {
    if (!MySelfData || !MySelfData.possessions) return;
    console.log('FLCF: favours/character data obtained via ' + (source || 'interception'));

    var contactsID, storiesID;
    for (var i = 0; i < MySelfData.possessions.length; i++) {
        if (MySelfData.possessions[i].name == "Contacts") contactsID = i;
        if (MySelfData.possessions[i].name == "Stories") storiesID = i;
    }

    resetFavours();
    if (contactsID !== undefined) {
        for (i = 0; i < MySelfData.possessions[contactsID].possessions.length; i++) {
            if (MySelfData.possessions[contactsID].possessions[i].name in FLData.favours) {
                FLData.favours[MySelfData.possessions[contactsID].possessions[i].name] = MySelfData.possessions[contactsID].possessions[i].level;
            }
        }
    }

    FLData.tasteGarden = 0;
    if (storiesID !== undefined) {
        for (i = 0; i < MySelfData.possessions[storiesID].possessions.length; i++) {
            if (MySelfData.possessions[storiesID].possessions[i].qualityPossessedId == 69445506) {
                FLData.tasteGarden = MySelfData.possessions[storiesID].possessions[i].level;
            }
        }
    }

    FLData.mantel = (MySelfData.character && MySelfData.character.mantelpieceItem && MySelfData.character.mantelpieceItem.image) ? MySelfData.character.mantelpieceItem : null;
    FLData.scrapbook = (MySelfData.character && MySelfData.character.scrapbookStatus && MySelfData.character.scrapbookStatus.image) ? MySelfData.character.scrapbookStatus : null;

    if (MySelfData.character && typeof MySelfData.character.actions === 'number') {
        FLData.lastActions = MySelfData.character.actions;
    }

    FLData.favoursSeen = true;
    RenderFavours();
}

// A branch message's possession refers to the displayed mantelpiece or
// scrapbook quality if the names match (with the image as fallback signature).
function matchesDisplay(possession, item) {
    if (!item) return false;
    if (item.name) return possession.name === item.name;
    return !!item.image && possession.image === item.image;
}

// Storylet/agent branch results: quality changes arrive in messages[].possession,
// which keeps favours, Taste of the Garden, and the displayed mantelpiece and
// scrapbook qualities (e.g. The Airs of London) current as you play. Agent
// plots advance one step per action spent, so each branch result also moves
// the local countdown along until the next authoritative /api/agents snapshot.
// The true cost of the branch (0, 1, or several actions) is taken from the
// recorded branch costs; failing that, it is derived from the change in
// endStorylet.currentActionsRemaining (which undercounts when the candle
// regenerated in between); failing that too, one action is assumed.
function onBranchData(data, requestBody) {
    if (!data) return;

    var spent = null;
    if (requestBody) {
        try {
            var branchId = JSON.parse(requestBody).branchId;
            if (typeof FLData.branchCosts[branchId] === 'number') {
                spent = FLData.branchCosts[branchId];
            }
        } catch (e) {}
    }

    var newActions = (data.endStorylet && typeof data.endStorylet.currentActionsRemaining === 'number') ? data.endStorylet.currentActionsRemaining : null;
    if (newActions !== null) {
        if (spent === null && FLData.lastActions !== null) {
            spent = FLData.lastActions - newActions;
            if (spent < 0) spent = 0;
        }
        FLData.lastActions = newActions;
    }
    if (spent === null) spent = 1;

    var render = false;
    if (FLData.agents && spent > 0) {
        FLData.agents.forEach(function(agent) {
            agent._flcfSpent = (agent._flcfSpent || 0) + spent;
        });
        render = true;
    }

    if (!data.messages || !data.messages.length) {
        if (render) RenderFavours();
        return;
    }

    var changed = false;
    data.messages.forEach(function(message) {
        var p = message.possession;
        if (!p) return;
        if (p.name in FLData.favours) {
            FLData.favours[p.name] = p.level;
            changed = true;
        }
        if (p.qualityPossessedId == 69445506) {
            FLData.tasteGarden = p.level;
            changed = true;
        }
        if (matchesDisplay(p, FLData.mantel)) {
            FLData.mantel.effectiveLevel = (typeof p.effectiveLevel === 'number') ? p.effectiveLevel : p.level;
            changed = true;
        }
        if (matchesDisplay(p, FLData.scrapbook)) {
            FLData.scrapbook.effectiveLevel = (typeof p.effectiveLevel === 'number') ? p.effectiveLevel : p.level;
            changed = true;
        }
    });
    if (changed) console.log('FLCF: tracked qualities updated via intercepted branch result');
    if (changed || render) RenderFavours();
}

// Any storylet payload that lists branches also states each branch's action
// cost (the number shown on the GO button); remember them so the exact cost
// can be charged when that branch is chosen.
function recordBranchCosts(data) {
    var storylet = data && data.storylet;
    if (!storylet || !storylet.childBranches) return;
    storylet.childBranches.forEach(function(branch) {
        if (branch && typeof branch.id === 'number' && typeof branch.actionCost === 'number') {
            FLData.branchCosts[branch.id] = branch.actionCost;
        }
    });
}

// A fresh, authoritative snapshot for an agent means duration/elapsed are
// current as of right now, so any locally-accumulated spend count for it is
// discarded and restarts from zero.
function resetAgentSpent(agent) {
    agent._flcfSpent = 0;
}

// Accepts the full {agents: [...]} list from GET /api/agents, or a single
// updated agent object (however an assign/plot-change endpoint returns it:
// as the bare object, or nested under an 'agent' key) and merges it into the
// stored list by id, so a partial response only refreshes the agent it names.
function onAgentsData(data, source) {
    if (!data) return;

    if (Array.isArray(data.agents)) {
        console.log('FLCF: agents data obtained via ' + (source || 'interception'));
        data.agents.forEach(resetAgentSpent);
        FLData.agents = data.agents;
        RenderFavours();
        return;
    }

    var incoming = (data.agent && typeof data.agent === 'object') ? data.agent : data;
    if (!incoming || typeof incoming.id === 'undefined' || !incoming.plot) return;

    console.log('FLCF: single agent update obtained via ' + (source || 'interception') + ' (id ' + incoming.id + ')');
    resetAgentSpent(incoming);
    if (!FLData.agents) FLData.agents = [];
    var idx = -1;
    for (var i = 0; i < FLData.agents.length; i++) {
        if (FLData.agents[i].id === incoming.id) { idx = i; break; }
    }
    if (idx >= 0) FLData.agents[idx] = incoming; else FLData.agents.push(incoming);
    RenderFavours();
}

// ---------------------------------------------------------------------------
// Fallback / manual refresh: direct API calls, used only if interception has
// not produced data shortly after load, or when the user clicks to refresh.
// ---------------------------------------------------------------------------
function getAccessToken() {
    var access_token = localStorage.getItem("access_token");
    if (access_token == null) access_token = sessionStorage.getItem("access_token");
    return access_token;
}

function fetchFavoursData(callback) {
    $.ajax({
        method: 'GET',
        url: 'https://api.fallenlondon.com/api/character/myself',
        headers: {
            "authorization": "Bearer " + getAccessToken(),
            "accept": "application/json, text/plain, */*"
        },
        timeout: 20000,
        success: function(result) {
            callback(null, result);
        },
        error: function(xhr, status, errorThrown) {
            callback({ status: status, error: errorThrown }, null);
        }
    });
}

function fetchAgentsData(callback) {
    $.ajax({
        method: 'GET',
        url: 'https://api.fallenlondon.com/api/agents',
        headers: {
            "authorization": "Bearer " + getAccessToken(),
            "accept": "application/json, text/plain, */*"
        },
        timeout: 20000,
        success: function(result) {
            callback(null, result);
        },
        error: function(xhr, status, errorThrown) {
            callback({ status: status, error: errorThrown }, null);
        }
    });
}

function manualRefresh() {
    fetchFavoursData(function(err, MySelfData) {
        if (err) {
            console.log("FLCF Error! " + err.status + " " + err.error);
            $('#FLCF').text("Error! " + err.status + " " + err.error + " (click to retry)");
            return;
        }
        onMyselfData(MySelfData, 'manual refresh (direct API call)');
    });
    fetchAgentsData(function(err, agentsData) {
        if (!err) onAgentsData(agentsData, 'manual refresh (direct API call)');
    });
}

// ---------------------------------------------------------------------------
// Display.
// ---------------------------------------------------------------------------
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

    if (divLocation == 'top') {
        $('.top-stripe__site-title').remove();
        $('.top-stripe__inner-container').prepend('<div id="TopFLCF"><div id="ContainerFLCF"></div></div>');
    } else {
        $('button.travel-button--infobar').after('<div id="RightFLCF"><div id="ContainerFLCF"></div></div>');
    }

    $('#ContainerFLCF').append('<div id="FLCF" title="Updates automatically from the game\'s own data. Click anywhere here to force a refresh. To move the icons to the top or right, use the Tampermonkey menu.">Loading Contact Favours...</div>');

    $('#ContainerFLCF').off('click').on('click', function(event) {
        event.preventDefault();
        $('#FLCF').text("Loading Contact Favours...");
        manualRefresh();
    });
}

function RenderFavours() {
    if (!document.querySelector('#FLCF')) return;
    if (!FLData.favoursSeen) return;

    var divLoc = GM_getValue("divLocation", 'right');
    var agentsNewLine = GM_getValue("agentsNewLine", 'No');

    var CreatedHTML = "";
    $.each(FLData.favours, function(faction, amount) {
        CreatedHTML += '<div class="item"><img height="20" width="20" border="0" src="https://images.fallenlondon.com/icons/' + FactionIcon[faction] + 'small.png" />&nbsp;' + amount + '</div>';
    });

    if (FLData.tasteGarden > 0) {
        CreatedHTML += '<div class="item"><img height="20" width="20" border="0" src="https://images.fallenlondon.com/icons/foliagesmall.png" />&nbsp;' + FLData.tasteGarden + '</div>';
    }

    if (FLData.mantel) {
        CreatedHTML += '<div class="item"><img height="20" width="20" border="0" src="https://images.fallenlondon.com/icons/' + FLData.mantel.image + 'small.png" />&nbsp;' + FLData.mantel.effectiveLevel + '</div>';
    }

    if (FLData.scrapbook) {
        CreatedHTML += '<div class="item"><img height="20" width="20" border="0" src="https://images.fallenlondon.com/icons/' + FLData.scrapbook.image + 'small.png" />&nbsp;' + FLData.scrapbook.effectiveLevel + '</div>';
    }

    if (FLData.agents) {
        var firstAgent = true;
        FLData.agents.forEach(function(agent) {
            var remaining = 0;
            if (agent.plot && typeof agent.plot.duration === 'number' && typeof agent.plot.elapsed === 'number') {
                remaining = agent.plot.duration - agent.plot.elapsed - (agent._flcfSpent || 0);
                if (remaining < 0) remaining = 0;
            }
            var imgSrc = agent.image ? 'https://images.fallenlondon.com/icons/' + agent.image + 'small.png' : '';
            if (imgSrc && remaining > 0) {
                var extraStyle = "";
                if (firstAgent && divLoc === 'right' && agentsNewLine === 'Yes') {
                    extraStyle = ' style="grid-column: 1;"';
                }
                CreatedHTML += '<div class="item"' + extraStyle + '><img height="20" width="20" border="0" src="' + imgSrc + '" />&nbsp;' + remaining + '</div>';
                firstAgent = false;
            }
        });
    }

    $("#FLCF").html(CreatedHTML);
}

function updateFavours(divLocation) {
    if (!document.querySelector('#FLCF')) {
        addHTMLElements(divLocation);
    }
    RenderFavours();
}

$(document).ready(function() {
    'use strict';
    var divLocation = GM_getValue("divLocation", 'right');

    const KEY = 'divLocation';
    const DEFAULT = 'right';
    const ALT = { right: 'top', top: 'right' };
    let current = GM_getValue(KEY, DEFAULT);

    const KEY_AGENTS = 'agentsNewLine';
    const DEFAULT_AGENTS = 'No';
    const ALT_AGENTS = { 'No': 'Yes', 'Yes': 'No' };
    let currentAgents = GM_getValue(KEY_AGENTS, DEFAULT_AGENTS);

    updateFavours(current);

    // Fallback: if the game's own calls were not intercepted within 15
    // seconds (or the game never requests /api/agents by itself), fetch the
    // missing pieces once. No retries; clicking the area retries manually.
    setTimeout(function() {
        if (!FLData.favoursSeen) {
            console.log('FLCF: no myself call intercepted within 15s, using fallback fetch');
            fetchFavoursData(function(err, MySelfData) {
                if (err) {
                    console.log("FLCF Error! " + err.status + " " + err.error);
                    $('#FLCF').text("Error! " + err.status + " " + err.error + " (click to retry)");
                    return;
                }
                onMyselfData(MySelfData, 'fallback fetch (direct API call)');
            });
        }
        if (FLData.agents === null) {
            console.log('FLCF: no agents call intercepted within 15s, using fallback fetch');
            fetchAgentsData(function(err, agentsData) {
                if (!err) onAgentsData(agentsData, 'fallback fetch (direct API call)');
            });
        }
    }, 15000);

    GM_registerMenuCommand(`Position: ${current} (toggle)`, async () => {
        current = ALT[current];
        await GM_setValue(KEY, current);
        updateFavours(current);
        alert(`You will need to reload the page to move the icons to the ${current}`);
    });

    GM_registerMenuCommand(`Agents on their own line when displayed on right: ${currentAgents} (toggle)`, async () => {
        currentAgents = ALT_AGENTS[currentAgents];
        await GM_setValue(KEY_AGENTS, currentAgents);
        RenderFavours();
    });

    setInterval(updateFavours, 10000, divLocation);
});
