using System;

// Paste into a separate Execute C# Code sub-action in Streamer.bot.
// Required arguments: rewardId, redemptionId, status (CANCELED or FULFILLED).
public class CPHInline
{
    public bool Execute()
    {
        string rewardId, redemptionId, status;
        if (!TryGetRequiredArgument("rewardId", out rewardId) ||
            !TryGetRequiredArgument("redemptionId", out redemptionId) ||
            !TryGetRequiredArgument("status", out status))
        {
            return false;
        }

        status = status.ToUpperInvariant();
        if (status != "CANCELED" && status != "FULFILLED")
        {
            CPH.LogError("Cherreshenka: status должен быть CANCELED или FULFILLED.");
            return false;
        }

        try
        {
            bool success = status == "CANCELED"
                ? CPH.TwitchRedemptionCancel(rewardId, redemptionId)
                : CPH.TwitchRedemptionFulfill(rewardId, redemptionId);

            string details = $"rewardId={rewardId}, redemptionId={redemptionId}, status={status}";
            if (success)
            {
                CPH.LogInfo($"Cherreshenka: статус покупки обновлён ({details}).");
            }
            else
            {
                CPH.LogError($"Cherreshenka: не удалось обновить статус покупки ({details}).");
            }

            return success;
        }
        catch (Exception error)
        {
            CPH.LogError($"Cherreshenka: ошибка обновления статуса покупки: {error}");
            return false;
        }
    }

    private bool TryGetRequiredArgument(string name, out string value)
    {
        if (!CPH.TryGetArg(name, out value) || String.IsNullOrWhiteSpace(value))
        {
            CPH.LogError($"Cherreshenka: отсутствует обязательный аргумент {name}.");
            return false;
        }

        value = value.Trim();
        return true;
    }
}
