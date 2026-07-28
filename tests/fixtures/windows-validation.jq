(.inbounds[] | select(.type == "tun")) |= (
  .auto_route = false |
  .auto_redirect = false |
  .strict_route = false |
  del(.route_exclude_address)
)
