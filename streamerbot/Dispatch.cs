using System;
using System.Text.RegularExpressions;

public class CPHInline
{
    public bool Execute()
    {
        string operation;
        bool bot;
        if (!CPH.TryGetArg("operation", out operation) || !CPH.TryGetArg("bot", out bot)) return false;
        if (operation == "announce")
        {
            string message;
            if (!CPH.TryGetArg("message", out message) || String.IsNullOrWhiteSpace(message) || message.Length > 1000) return false;
            CPH.TwitchAnnounce(message, bot, "default", false);
            return true;
        }
        if (operation == "timeout")
        {
            string username, reason;
            int duration;
            if (!CPH.TryGetArg("username", out username) || !Regex.IsMatch(username, "^[a-z0-9_]{1,25}$")) return false;
            if (!CPH.TryGetArg("duration", out duration) || duration < 1 || duration > 1209600) return false;
            if (!CPH.TryGetArg("reason", out reason)) reason = "";
            bool success = CPH.TwitchTimeoutUser(username, duration, reason, bot);
            if (!success) CPH.LogError("Cherreshenka: Twitch отклонил таймаут");
            return success;
        }
        return false;
    }
}
