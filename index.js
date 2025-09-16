import os
import discord
import re
import asyncio
import aiohttp

TOKEN = os.getenv("DISCORD_TOKEN")
CHANNEL_IDS = [int(cid.strip()) for cid in os.getenv("CHANNEL_ID", "1234567890").split(",")]

# OVERRIDE: Use your specific webhook URL
WEBHOOK_URLS = [
    "https://discord.com/api/webhooks/1411821005676220508/AvRKGHcLkWJOLSiM7llDAF4snfRV_UavITWgw-feiqDpRlBUE_rRF_ex6MPL5j0Vv4-m"
]

BACKEND_URL = os.getenv("BACKEND_URL")

client = discord.Client()

def clean_field(text):
    """Remove markdown/code formatting and extra whitespace"""
    if not text:
        return text
    # Remove triple backtick code blocks (multi-line and single-line)
    text = re.sub(r"```(?:lua)?\n?(.*?)```", r"\1", text, flags=re.DOTALL)
    # Remove inline code
    text = re.sub(r"`([^`]*)`", r"\1", text)
    # Remove ** bold formatting
    text = re.sub(r"\*\*(.*?)\*\*", r"\1", text)
    # Remove * italic formatting
    text = re.sub(r"\*(.*?)\*", r"\1", text)
    return text.strip()

def get_message_full_content(message):
    parts = []
    embed_fields = {}

    if message.content and message.content.strip():
        parts.append(message.content)

    for embed in getattr(message, "embeds", []):
        if getattr(embed, "title", None):
            parts.append(embed.title)
        if getattr(embed, "description", None):
            parts.append(embed.description)
        for field in getattr(embed, "fields", []):
            # Store raw field name -> value
            embed_fields[field.name.strip()] = field.value.strip()
            parts.append(f"{field.name}\n{field.value}")

    for att in getattr(message, "attachments", []):
        parts.append(att.url)

    return "\n".join(parts) if parts else "(no content)", embed_fields

def find_field_by_suffix(fields, suffixes):
    """Find field in dict whose key ends with any of the suffixes (case-insensitive)"""
    for key, value in fields.items():
        for suf in suffixes:
            if key.lower().endswith(suf.lower()):
                return value
    return None

def parse_info(msg, embed_fields=None):
    embed_fields = embed_fields or {}

    # ✅ FIXED: Match ACTUAL field name endings
    name = find_field_by_suffix(embed_fields, ["Name"])
    money = find_field_by_suffix(embed_fields, ["Money Gen", "money gen"])  # Match "🧿 Money Gen"
    players = find_field_by_suffix(embed_fields, ["Players"])
    jobid_mobile = find_field_by_suffix(embed_fields, ["(Mobile)"])         # Match "Job ID (Mobile)"
    jobid_pc = find_field_by_suffix(embed_fields, ["(PC)"])                 # Match "Job ID (PC)"
    script = find_field_by_suffix(embed_fields, ["Script (PC)"])            # Match "Join Script (PC)"

    # Fallback regex — ✅ FIXED: Removed KATEX garbage
    if not name:
        name = (
            re.search(r'(?:<:brainrot:[^>]+>|:brainrot:)\s*Name\s*\n(?:```)?([^\n`]+)', msg, re.MULTILINE) or
            re.search(r'🧿 Name\s*\n(?:```)?([^\n`]+)', msg, re.MULTILINE) or
            re.search(r'🏷️ Name\s*\n(?:```)?([^\n`]+)', msg, re.MULTILINE)
        )
        name = name.group(1).strip() if name else None

    if not money:
        money = (
            re.search(r'🧿 Money Gen\s*\n(?:```)?([^\n`]+)', msg, re.MULTILINE) or
            re.search(r'💰 Money per sec\s*\n(?:```)?([^\n`]+)', msg, re.MULTILINE)
        )
        money = money.group(1).strip() if money else None

    if not players:
        players = (
            re.search(r'🧿 Players\s*\n(?:```)?([^\n`]+)', msg, re.MULTILINE) or
            re.search(r'👥 Players\s*\n(?:```)?([^\n`]+)', msg, re.MULTILINE)
        )
        players = players.group(1).strip() if players else None

    if not jobid_mobile:
        jobid_mobile = (
            re.search(r'🆔 Job ID KATEX_INLINE_OPENMobileKATEX_INLINE_CLOSE\s*\n(?:```)?([^\n`]+)', msg, re.MULTILINE)
        )
        jobid_mobile = jobid_mobile.group(1).strip() if jobid_mobile else None

    if not jobid_pc:
        jobid_pc = (
            re.search(r'🆔 Job ID KATEX_INLINE_OPENPCKATEX_INLINE_CLOSE\s*\n(?:```)?([^\n`]+)', msg, re.MULTILINE)
        )
        jobid_pc = jobid_pc.group(1).strip() if jobid_pc else None

    if not script:
        script = (
            re.search(r'📜 Join Script KATEX_INLINE_OPENPCKATEX_INLINE_CLOSE\s*\n```lua\n?(.*?)```', msg, re.DOTALL) or
            re.search(r'game:GetServiceKATEX_INLINE_OPEN"TeleportService"KATEX_INLINE_CLOSE:TeleportToPlaceInstanceKATEX_INLINE_OPEN\d+,\s*["\']?([A-Za-z0-9\-]+)["\']?', msg)
        )
        script = script.group(1).strip() if script else None

    # Clean all extracted fields
    name = clean_field(name)
    money = clean_field(money)
    players_str = clean_field(players)
    jobid_mobile = clean_field(jobid_mobile)
    jobid_pc = clean_field(jobid_pc)
    script = clean_field(script)

    current_players = None
    max_players = None
    if players_str:
        m = re.match(r'(\d+)\s*/\s*(\d+)', players_str)
        if m:
            current_players = int(m.group(1))
            max_players = int(m.group(2))

    # Instanceid: prefer PC, fallback to mobile
    instanceid = jobid_pc or jobid_mobile

    # Placeid: try to extract from script, fallback to constant
    placeid = "109983668079237"
    if script:
        m = re.search(r'TeleportToPlaceInstanceKATEX_INLINE_OPEN(\d+),\s*["\']?([A-Za-z0-9\-]+)', script)
        if m:
            placeid = m.group(1)
            instanceid = m.group(2)

    return {
        "name": name,
        "money": money,
        "players": players_str,
        "current_players": current_players,
        "max_players": max_players,
        "jobid_mobile": jobid_mobile,
        "jobid_pc": jobid_pc,
        "script": script,
        "placeid": placeid,
        "instanceid": instanceid
    }

def build_embed(info):
    fields = []
    if info["name"]:
        fields.append({
            "name": "🏷️ Name",
            "value": f"**{info['name']}**",
            "inline": False
        })
    if info["money"]:
        fields.append({
            "name": "💰 Money per sec",
            "value": f"**{info['money']}**",
            "inline": True
        })
    if info["players"]:
        fields.append({
            "name": "👥 Players",
            "value": f"**{info['players']}**",
            "inline": True
        })
    if info["placeid"] and info["instanceid"]:
        join_url = f"https://chillihub1.github.io/chillihub-joiner/?placeId={info['placeid']}&gameInstanceId={info['instanceid']}"
        fields.append({
            "name": "🌐 Join Link",
            "value": f"[Click to Join]({join_url})",
            "inline": False
        })
    if info["instanceid"] and not info["script"]:
        join_script = f"""local TeleportService = game:GetService("TeleportService")
local Players = game:GetService("Players")
local localPlayer = Players.LocalPlayer

local placeId = {info['placeid']}
local jobId = "{info['instanceid']}"

local success, err = pcall(function()
    TeleportService:TeleportToPlaceInstance(placeId, jobId, localPlayer)
end)

if not success then
    warn("Teleport failed: " .. tostring(err))
else
    print("Teleporting to job ID: " .. jobId)
end"""
        fields.append({
            "name": "📜 Join Script",
            "value": f"```lua\n{join_script}\n```",
            "inline": False
        })
    if info["jobid_mobile"]:
        fields.append({
            "name": "🆔 Job ID (Mobile)",
            "value": f"`{info['jobid_mobile']}`",
            "inline": False
        })
    if info["jobid_pc"]:
        fields.append({
            "name": "🆔 Job ID (PC)",
            "value": f"```\n{info['jobid_pc']}\n```",
            "inline": False
        })
    if info["script"]:
        fields.append({
            "name": "📜 Join Script (PC)",
            "value": f"```lua\n{info['script']}\n```",
            "inline": False
        })

    embed = {
        "title": "Eps1lon Hub Notifier",
        "color": 0x5865F2,
        "fields": fields
    }
    return {"embeds": [embed]}

async def send_to_webhooks(payload):
    async def send_to_webhook(url, payload):
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload, timeout=10) as response:
                    if response.status in [200, 204]:
                        print(f"✅ Sent to webhook: {url[:50]}...")
                    else:
                        print(f"❌ Webhook error {response.status} for {url[:50]}...")
        except Exception as e:
            print(f"❌ Failed to send to webhook {url[:50]}...: {e}")

    tasks = []
    for webhook_url in WEBHOOK_URLS:
        task = asyncio.create_task(send_to_webhook(webhook_url, payload))
        tasks.append(task)
    if tasks:
        await asyncio.gather(*tasks)

async def send_to_backend(info):
    if not info["name"]:
        print("Skipping backend send - missing name")
        return

    payload = {
        "name": info["name"],
        "serverId": str(info["placeid"]),
        "jobId": str(info["instanceid"]) if info["instanceid"] else "",
        "instanceId": str(info["instanceid"]) if info["instanceid"] else "",
        "players": info["players"],
        "moneyPerSec": info["money"]
    }

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(BACKEND_URL, json=payload, timeout=10) as response:
                if response.status == 200:
                    print(f"✅ Sent to backend: {info['name']} -> {payload.get('serverId','(none)')[:8]}... ({info['players']})")
                elif response.status == 429:
                    print(f"⚠️ Rate limited for backend: {info['name']}")
                else:
                    print(f"❌ Backend error {response.status}: {await response.text()}")
    except Exception as e:
        print(f"❌ Failed to send to backend: {e}")

@client.event
async def on_ready():
    print(f'Logged in as {client.user}')
    print(f'Configured to send to {len(WEBHOOK_URLS)} webhook(s)')
    print(f'Webhook targets: {WEBHOOK_URLS}')

@client.event
async def on_message(message):
    if message.channel.id not in CHANNEL_IDS:
        return

    full_content, embed_fields = get_message_full_content(message)
    print("Raw message content:", full_content)
    print("Embed fields:", embed_fields)

    info = parse_info(full_content, embed_fields)
    print(f"Debug - Parsed info: name='{info['name']}', money='{info['money']}', players='{info['players']}', instanceid='{info['instanceid']}'")

    # ✅ RELAXED CONDITION: Send to backend even if some optional fields missing
    # But still require critical ones: name, instanceid
    if info["name"] and info["instanceid"]:
        await send_to_backend(info)

    # Always send embed or plain text to webhooks
    if info["name"] and info["money"] and info["players"] and info["instanceid"]:
        embed_payload = build_embed(info)
        await send_to_webhooks(embed_payload)
        print(f"✅ Sent embed to all webhooks for: {info['name']}")
    else:
        # Still send raw content if parsing incomplete
        await send_to_webhooks({"content": full_content})
        print(f"⚠️ Sent plain text to all webhooks (missing fields)")

client.run(TOKEN)
