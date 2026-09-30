-- Send and withdraw this flash run's persistent Notification Center alert.
local ok, result = pcall(function()
    local action, id, message = table.unpack(_cli.args, 2)
    assert(id and id:match("^glove%-flash%-%d+$"), "Invalid flash notification ID")
    _G.gloveFlashNotifications = _G.gloveFlashNotifications or {}
    local notifications = _G.gloveFlashNotifications

    if action == "clear" then
        if notifications[id] then
            notifications[id]:withdraw()
            notifications[id] = nil
        end
        return "cleared"
    elseif action == "status" then
        local notification = notifications[id]
        return notification and notification:delivered() and "delivered" or "not-delivered"
    elseif action == "show" then
        assert(message, "Missing bootloader instructions")
        if notifications[id] then notifications[id]:withdraw() end
        notifications[id] = hs.notify.new({
            title = "Glove80 ready to flash",
            informativeText = message,
            withdrawAfter = 0,
            alwaysPresent = true,
            soundName = "Glass",
        }):send()
        return "sent"
    end
    error("Unknown flash notification action")
end)

-- Keep Lua errors from hanging the hs CLI while it waits for a reply.
if not ok then return "error: " .. tostring(result) end
return result
