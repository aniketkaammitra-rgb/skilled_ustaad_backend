import {StatusCodes} from "http-status-codes";
import logger from "../libs/logger.js";

export default function errorHandler(err,req,res,_next){
    logger.error(err);
    const status = err.statusCode || StatusCodes.INTERNAL_SERVER_ERROR;
    res.status(status).json({
        error:err.message || "Internal Server Error",
    });
}