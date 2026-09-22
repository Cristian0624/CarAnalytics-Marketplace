from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request

from price_estimate_schemas import PriceEstimateRequest, PriceEstimateResponse
from services.price_estimate import PriceEstimateError, PriceEstimateService


router = APIRouter(tags=["price-estimate"])


async def get_price_estimate_service(request: Request):
    # Dispatch real GET requests through the app's listings router, without
    # relying on a public host, another worker, or a second running server.
    transport = httpx.ASGITransport(app=request.app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://internal") as client:
        yield PriceEstimateService(client)


@router.post("/price-estimate", response_model=PriceEstimateResponse)
async def estimate_price(
    payload: PriceEstimateRequest,
    service: Annotated[PriceEstimateService, Depends(get_price_estimate_service)],
):
    try:
        return await service.estimate(payload)
    except PriceEstimateError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
